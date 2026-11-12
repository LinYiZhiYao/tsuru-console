import { randomUUID } from 'crypto';
import { db, metricsStore } from '../db';
import { emit } from '../bus';
import { collectMetrics, probeServer } from './ssh';
import type { AlertEvent, AlertRule, MetricSample, ServerRecord } from '../types';

/**
 * 后台采集器：
 * - 每隔 TICK_MS 对「已在线」的机器采一次指标
 * - 每隔 PROBE_MS 对所有机器做一次连通性探测
 * - 采集后跑告警规则
 *
 * 串行 + 背压控制：机器多时不会同时开几十个 SSH 连接把本机打死。
 */

const TICK_MS = 15_000;
const PROBE_MS = 45_000;
const MAX_SAMPLES = 1440; // 保留 6 小时 @15s
const CONCURRENCY = 4;

let tickTimer: NodeJS.Timeout | null = null;
let probeTimer: NodeJS.Timeout | null = null;
let running = false;
let collecting = false;
let probing = false;

/** 简易并发闸门 */
async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (item === undefined) break;
      try {
        await fn(item);
      } catch {
        /* 单台失败不影响其他 */
      }
    }
  });
  await Promise.all(workers);
}

async function updateServerStatus(server: ServerRecord, status: ServerRecord['status'], latencyMs?: number) {
  let finalLatency = latencyMs;
  await db.update((d) => {
    const s = d.servers.find((x) => x.id === server.id);
    if (s) {
      s.status = status;
      if (status === 'offline') {
        s.latencyMs = undefined;
      } else if (latencyMs !== undefined) {
        s.latencyMs = latencyMs;
      }
      finalLatency = s.latencyMs;
      if (status === 'online') s.lastSeenAt = Date.now();
      s.updatedAt = Date.now();
    }
  });
  emit('server:status', { serverId: server.id, status, latencyMs: finalLatency });
}

async function collectAll() {
  if (collecting) return;
  collecting = true;
  try {
    const data = await db.read();
    const targets = data.servers.filter((s) => s.status !== 'offline');
    const fresh: Record<string, MetricSample> = {};

    if (targets.length > 0) {
      await runWithConcurrency(targets, CONCURRENCY, async (server) => {
        try {
          const sample = await collectMetrics(server);
          fresh[server.id] = sample;
          if (server.status !== 'online') await updateServerStatus(server, 'online');
        } catch {
          // 采集失败说明连不上了
          if (server.status === 'online') await updateServerStatus(server, 'offline');
        }
      });
    }

    if (Object.keys(fresh).length > 0) {
      const store = await metricsStore.read();
      for (const [serverId, sample] of Object.entries(fresh)) {
        const arr = store.series[serverId] ?? [];
        arr.push(sample);
        if (arr.length > MAX_SAMPLES) arr.splice(0, arr.length - MAX_SAMPLES);
        store.series[serverId] = arr;
      }
      await metricsStore.write(store);
    }

    // 即使所有机器都离线（fresh 为空），也要评估离线告警规则
    await evaluateAlerts(fresh);
  } finally {
    collecting = false;
  }
}

async function probeAll() {
  if (probing) return;
  probing = true;
  try {
    const data = await db.read();
    await runWithConcurrency(data.servers, CONCURRENCY, async (server) => {
      try {
        const { latencyMs } = await probeServer(server);
        if (
          server.status !== 'online' ||
          server.latencyMs === undefined ||
          Math.abs(server.latencyMs - latencyMs) > 30
        ) {
          await updateServerStatus(server, 'online', latencyMs);
        }
      } catch {
        if (server.status !== 'offline') {
          await updateServerStatus(server, 'offline');
        }
      }
    });
  } finally {
    probing = false;
  }
}

/* ------------------------------------------------------------------ */
/*  告警评估                                                           */
/* ------------------------------------------------------------------ */

/** serverId+ruleId -> 连续命中次数 */
const hitCounters = new Map<string, number>();
/** 告警抑制：同一条规则在冷却期内不重复推送 */
const lastAlertAt = new Map<string, number>();
const ALERT_COOLDOWN_MS = 5 * 60_000;

async function evaluateAlerts(fresh: Record<string, MetricSample>) {
  const store = await metricsStore.read();
  const rules = store.rules.filter((r) => r.enabled);
  if (!rules.length) return;

  const servers = (await db.read()).servers;
  const newEvents: AlertEvent[] = [];

  for (const rule of rules) {
    const sample = fresh[rule.serverId];
    const server = servers.find((s) => s.id === rule.serverId);
    if (!server) continue;

    let value = 0;
    let triggered = false;

    if (rule.metric === 'offline') {
      triggered = server.status === 'offline';
      value = 0;
    } else if (sample) {
      if (rule.metric === 'cpu') value = sample.cpu ?? 0;
      else if (rule.metric === 'mem')
        value = sample.memTotal ? ((sample.memUsed ?? 0) / sample.memTotal) * 100 : 0;
      else if (rule.metric === 'disk')
        value = sample.diskTotal ? ((sample.diskUsed ?? 0) / sample.diskTotal) * 100 : 0;
      triggered = value >= rule.threshold;
    }

    const key = `${rule.serverId}:${rule.id}`;
    if (triggered) {
      const n = (hitCounters.get(key) ?? 0) + 1;
      hitCounters.set(key, n);

      if (n >= rule.consecutive) {
        const last = lastAlertAt.get(key) ?? 0;
        if (Date.now() - last > ALERT_COOLDOWN_MS) {
          lastAlertAt.set(key, Date.now());
          newEvents.push({
            id: randomUUID(),
            ruleId: rule.id,
            serverId: rule.serverId,
            serverName: server.name,
            metric: rule.metric,
            value: Number(value.toFixed(1)),
            threshold: rule.threshold,
            message:
              rule.metric === 'offline'
                ? `${server.name} 已离线`
                : `${server.name} ${metricLabel(rule.metric)} 达到 ${value.toFixed(1)}%（阈值 ${rule.threshold}%）`,
            at: Date.now(),
            acknowledged: false,
          });
        }
      }
    } else {
      hitCounters.delete(key);
    }
  }

  if (!newEvents.length) return;

  await metricsStore.update((s) => {
    s.events = [...newEvents, ...s.events].slice(0, 200);
  });
  for (const e of newEvents) emit('alert:new', e);
}

function metricLabel(m: string) {
  return m === 'cpu' ? 'CPU 使用率' : m === 'mem' ? '内存使用率' : m === 'disk' ? '磁盘使用率' : m;
}

/* ------------------------------------------------------------------ */
/*  启停                                                               */
/* ------------------------------------------------------------------ */

export function startMonitor() {
  if (running) return;
  running = true;
  // 启动后延迟 3 秒首次探测，避开窗口初始化的 IO 峰值
  setTimeout(() => {
    void probeAll();
  }, 3000);
  tickTimer = setInterval(() => void collectAll(), TICK_MS);
  probeTimer = setInterval(() => void probeAll(), PROBE_MS);
}

export function stopMonitor() {
  if (tickTimer) clearInterval(tickTimer);
  if (probeTimer) clearInterval(probeTimer);
  tickTimer = null;
  probeTimer = null;
  running = false;
}

/** 立即对单台机器采一次，用于详情页打开时快速出图 */
export async function sampleNow(serverId: string) {
  const server = (await db.read()).servers.find((s) => s.id === serverId);
  if (!server) throw new Error('服务器不存在');
  const sample = await collectMetrics(server);
  const store = await metricsStore.read();
  const arr = store.series[serverId] ?? [];
  arr.push(sample);
  if (arr.length > MAX_SAMPLES) arr.splice(0, arr.length - MAX_SAMPLES);
  store.series[serverId] = arr;
  await metricsStore.write(store);
  return sample;
}

export async function getSeries(serverId: string) {
  const store = await metricsStore.read();
  return store.series[serverId] ?? [];
}

export async function getRules(): Promise<AlertRule[]> {
  return (await metricsStore.read()).rules;
}

export async function upsertRule(rule: AlertRule) {
  await metricsStore.update((s) => {
    const idx = s.rules.findIndex((r) => r.id === rule.id);
    if (idx >= 0) s.rules[idx] = rule;
    else s.rules.push(rule);
  });
  return rule;
}

export async function deleteRule(id: string) {
  await metricsStore.update((s) => {
    s.rules = s.rules.filter((r) => r.id !== id);
  });
}

export async function getEvents(): Promise<AlertEvent[]> {
  return (await metricsStore.read()).events;
}

export async function ackEvent(id: string) {
  await metricsStore.update((s) => {
    const e = s.events.find((x) => x.id === id);
    if (e) e.acknowledged = true;
  });
}

export async function clearEvents() {
  await metricsStore.update((s) => {
    s.events = [];
  });
}
