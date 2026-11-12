import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Server,
  Cloud,
  Activity,
  AlertTriangle,
  ArrowRight,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  TerminalSquare,
  FolderTree,
  Zap,
  ShieldCheck,
} from 'lucide-react';
import { useApp } from '@/stores/app';
import { StatusDot, Chip, MiniBar, EmptyState } from '@/components/Primitives';
import { LineChart } from '@/components/LineChart';
import { PROVIDER_META, fmtBytes, fmtPercent, fmtRelative, unwrap } from '@/lib/utils';
import type { ServerRecord, MetricSample } from '@/types';

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.02 } },
};
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const } },
};

/**
 * 总览页。
 * 布局是「纵向填满」的三段式：指标条 → 主体（服务器列表 + 右栏）→ 底部图表带，
 * 用 flex-1 让中段吃掉剩余高度，避免内容堆在顶部、下方留一大片空。
 */
export function DashboardPage() {
  const servers = useApp((s) => s.servers);
  const accounts = useApp((s) => s.accounts);
  const alerts = useApp((s) => s.alerts);
  const navigate = useApp((s) => s.navigate);
  const openTerminalTab = useApp((s) => s.openTerminalTab);

  const [samples, setSamples] = useState<Record<string, MetricSample[]>>({});

  const serverIdsKey = useMemo(() => servers.map((s) => s.id).join(','), [servers]);

  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      const currentServers = useApp.getState().servers;
      const out: Record<string, MetricSample[]> = {};
      await Promise.all(
        currentServers.map(async (s) => {
          try {
            out[s.id] = await unwrap(window.nebula.metrics.get(s.id));
          } catch {
            /* 单台失败忽略 */
          }
        }),
      );
      if (!cancelled) setSamples(out);
    };
    void fetchAll();
    const timer = setInterval(() => void fetchAll(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [serverIdsKey]);

  const stats = useMemo(() => {
    const latest = (id: string) => {
      const arr = samples[id];
      return arr && arr.length ? arr[arr.length - 1] : undefined;
    };
    const online = servers.filter((s) => s.status === 'online');
    const cpuVals = online
      .map((s) => latest(s.id)?.cpu)
      .filter((v): v is number => v !== undefined);
    const avgCpu = cpuVals.length ? cpuVals.reduce((a, b) => a + b, 0) / cpuVals.length : 0;
    const totalMem = online.reduce((a, s) => a + (latest(s.id)?.memTotal ?? 0), 0);
    const usedMem = online.reduce((a, s) => a + (latest(s.id)?.memUsed ?? 0), 0);
    const totalDisk = online.reduce((a, s) => a + (latest(s.id)?.diskTotal ?? 0), 0);
    const usedDisk = online.reduce((a, s) => a + (latest(s.id)?.diskUsed ?? 0), 0);
    return {
      onlineCount: online.length,
      offlineCount: servers.length - online.length,
      avgCpu,
      totalMem,
      usedMem,
      totalDisk,
      usedDisk,
      latest,
      cpuVals,
    };
  }, [servers, samples]);

  const unacked = alerts.filter((a) => !a.acknowledged);

  /* 聚合所有在线机器的 CPU 均值曲线，用于底部趋势图 */
  const trend = useMemo(() => {
    const onlineIds = servers.filter((s) => s.status === 'online').map((s) => s.id);
    const lengths = onlineIds.map((id) => samples[id]?.length ?? 0);
    const length = Math.min(48, lengths.length ? Math.max(...lengths) : 0);
    if (length === 0) return { ts: [] as number[], cpu: [] as (number | null)[] };

    const refId = onlineIds[lengths.indexOf(Math.max(...lengths))];
    const ref = samples[refId];
    if (!ref) return { ts: [] as number[], cpu: [] as (number | null)[] };
    const refSlice = ref.slice(-length);
    const ts = refSlice.map((s) => s.t);

    const cpu = ts.map((t) => {
      const vals: number[] = [];
      for (const id of onlineIds) {
        const arr = samples[id];
        if (!arr?.length) continue;
        // 找时间最接近的点，偏差超过 60 秒视为缺失
        let best = arr[0];
        let bestDiff = Math.abs(arr[0].t - t);
        for (const p of arr) {
          const d = Math.abs(p.t - t);
          if (d < bestDiff) {
            best = p;
            bestDiff = d;
          }
        }
        if (bestDiff < 60_000 && best.cpu !== undefined) vals.push(best.cpu);
      }
      return vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)) : null;
    });
    return { ts, cpu };
  }, [servers, samples]);

  return (
    <div className="h-full flex flex-col overflow-hidden px-5 py-4">
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="flex-1 min-h-0 flex flex-col gap-3"
      >
        {/* 顶部四张指标卡 */}
        <motion.div variants={item} className="grid grid-cols-4 gap-3 shrink-0">
          <StatCard
            label="纳管服务器"
            value={String(servers.length)}
            sub={`${stats.onlineCount} 在线 · ${stats.offlineCount} 离线`}
            icon={Server}
            accent="#0f9d70"
            onClick={() => navigate({ name: 'servers' })}
          />
          <StatCard
            label="云账号"
            value={String(accounts.length)}
            sub={
              accounts.length
                ? accounts.map((a) => PROVIDER_META[a.provider]?.short ?? a.provider).join(' · ')
                : '尚未接入'
            }
            icon={Cloud}
            accent="#0891a8"
            onClick={() => navigate({ name: 'cloud' })}
          />
          <StatCard
            label="平均 CPU"
            value={fmtPercent(stats.avgCpu)}
            sub={`${stats.cpuVals.length} 台在采集`}
            icon={Cpu}
            accent="#7454d8"
            progress={stats.avgCpu}
            onClick={() => navigate({ name: 'monitor' })}
          />
          <StatCard
            label="未处理告警"
            value={String(unacked.length)}
            sub={unacked.length ? '需要关注' : '一切正常'}
            icon={AlertTriangle}
            accent={unacked.length ? '#dc2f4b' : '#8b94a3'}
            onClick={() => navigate({ name: 'alerts' })}
          />
        </motion.div>

        {/* 主体：服务器列表 + 右栏 */}
        <div className="flex-1 min-h-0 grid grid-cols-[1.6fr_1fr] gap-3">
          <motion.div variants={item} className="panel flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 h-[42px] shrink-0 border-b border-[rgba(16,24,40,0.06)]">
              <div className="flex items-center gap-2">
                <h2 className="text-[12.5px] font-semibold text-[#12171f]">服务器状态</h2>
                <Chip color="#5b6473" bg="rgba(16,24,40,0.05)">
                  {servers.length}
                </Chip>
              </div>
              <button
                onClick={() => navigate({ name: 'servers' })}
                className="flex items-center gap-1 text-[11px] text-[#8b94a3] hover:text-[#0f9d70] transition-colors duration-150"
              >
                查看全部 <ArrowRight size={11} />
              </button>
            </div>

            {servers.length === 0 ? (
              <EmptyState
                icon={<Server size={22} color="#a8b0bd" />}
                title="还没有纳管任何服务器"
                desc="点击右上角「添加服务器」，或用 SSH 信息手动录入一台"
              />
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar flex flex-col">
                {/* 行数少时均匀铺满（justify-between），首行贴顶、末行贴底，中间均分 */}
                <div
                  className={`flex flex-col ${servers.length <= 6 ? 'flex-1 justify-between' : ''}`}
                >
                  {servers.map((s, i) => (
                    <ServerRow
                      key={s.id}
                      server={s}
                      sample={stats.latest(s.id)}
                      index={i}
                      onClick={() => navigate({ name: 'server', id: s.id })}
                      onTerminal={() => openTerminalTab(s.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </motion.div>

          {/* 右栏：资源汇总 + 告警，纵向撑满 */}
          <div className="flex flex-col gap-3 min-h-0">
            <motion.div variants={item} className="panel px-4 py-3.5 shrink-0">
              <h2 className="text-[12.5px] font-semibold text-[#12171f] mb-3">汇总资源</h2>
              <div className="space-y-2.5">
                <ResourceRow
                  icon={Cpu}
                  label="CPU 均值"
                  value={fmtPercent(stats.avgCpu)}
                  pct={stats.avgCpu}
                  color="#7454d8"
                />
                <ResourceRow
                  icon={MemoryStick}
                  label="内存占用"
                  value={`${fmtBytes(stats.usedMem)} / ${fmtBytes(stats.totalMem)}`}
                  pct={stats.totalMem ? (stats.usedMem / stats.totalMem) * 100 : 0}
                  color="#0891a8"
                />
                <ResourceRow
                  icon={HardDrive}
                  label="磁盘占用"
                  value={`${fmtBytes(stats.usedDisk)} / ${fmtBytes(stats.totalDisk)}`}
                  pct={stats.totalDisk ? (stats.usedDisk / stats.totalDisk) * 100 : 0}
                  color="#0f9d70"
                />
                <ResourceRow
                  icon={ShieldCheck}
                  label="在线率"
                  value={`${servers.length ? Math.round((stats.onlineCount / servers.length) * 100) : 0}%`}
                  pct={servers.length ? (stats.onlineCount / servers.length) * 100 : 0}
                  color="#b45309"
                />
              </div>
            </motion.div>

            <motion.div variants={item} className="panel flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex items-center justify-between px-4 h-[42px] shrink-0 border-b border-[rgba(16,24,40,0.06)]">
                <h2 className="text-[12.5px] font-semibold text-[#12171f]">最近告警</h2>
                <Chip
                  color={unacked.length ? '#dc2f4b' : '#0f9d70'}
                  bg={unacked.length ? 'rgba(220,47,75,0.09)' : 'rgba(15,157,112,0.09)'}
                >
                  {unacked.length} 未处理
                </Chip>
              </div>
              {alerts.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2">
                  <Zap size={18} className="text-[#c4cad3]" />
                  <p className="text-[11.5px] text-[#a8b0bd]">暂无告警记录</p>
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-[rgba(16,24,40,0.045)]">
                  {alerts.map((a, i) => (
                    <motion.div
                      key={a.id}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.08 + i * 0.03, duration: 0.22 }}
                      className="px-4 py-2.5 flex items-start gap-2"
                    >
                      <AlertTriangle
                        size={12}
                        className="mt-[2px] shrink-0"
                        style={{ color: a.acknowledged ? '#c4cad3' : '#b45309' }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11.5px] text-[#2c3543] leading-snug">{a.message}</p>
                        <p className="text-[10px] text-[#a8b0bd] mt-0.5 font-mono">{fmtRelative(a.at)}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        </div>

        {/* 底部：全局 CPU 趋势 + 快捷入口 */}
        <motion.div
          variants={item}
          className="grid grid-cols-[1.6fr_1fr] gap-3 shrink-0 h-[196px] min-h-0"
        >          <div className="panel px-4 pt-3 pb-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-1 shrink-0">
              <h2 className="text-[12.5px] font-semibold text-[#12171f]">全部在线机器 · CPU 均值趋势</h2>
              <span className="text-[10px] text-[#a8b0bd]">最近 {trend.ts.length} 个采样点</span>
            </div>
            {trend.ts.length > 1 ? (
              <div className="flex-1 min-h-0 -mx-1">
                <LineChart
                  timestamps={trend.ts}
                  yMax={100}
                  yUnit="%"
                  height="100%"
                  series={[{ name: 'CPU 均值', data: trend.cpu, color: '#7454d8', area: true }]}
                />
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-[11px] text-[#a8b0bd]">还没有足够的采样数据</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 grid-rows-2 gap-3">
            <QuickAction
              icon={TerminalSquare}
              label="打开终端"
              desc="多机 SSH 会话"
              color="#0f9d70"
              onClick={() => navigate({ name: 'terminal' })}
            />
            <QuickAction
              icon={Network}
              label="批量运维"
              desc="一次命令多机跑"
              color="#0891a8"
              onClick={() => navigate({ name: 'batch' })}
            />
            <QuickAction
              icon={Cloud}
              label="云资源"
              desc="同步实例列表"
              color="#7454d8"
              onClick={() => navigate({ name: 'cloud' })}
            />
            <QuickAction
              icon={AlertTriangle}
              label="告警规则"
              desc="阈值与通知"
              color="#b45309"
              onClick={() => navigate({ name: 'alerts' })}
            />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  progress,
  onClick,
}: {
  label: string;
  value: string;
  sub: string;
  icon: typeof Server;
  accent: string;
  progress?: number;
  onClick?: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="panel px-3.5 py-3 text-left group relative overflow-hidden"
    >
      <div
        className="absolute -top-8 -right-8 w-20 h-20 rounded-full opacity-[0.07] group-hover:opacity-[0.13] transition-opacity duration-300"
        style={{ background: accent, filter: 'blur(18px)' }}
      />
      <div className="relative flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[10.5px] text-[#8b94a3] mb-1.5">{label}</p>
          <p className="text-[22px] font-semibold text-[#12171f] leading-none tracking-tight font-mono">
            {value}
          </p>
          <p className="text-[10.5px] text-[#a8b0bd] mt-1.5 truncate">{sub}</p>
        </div>
        <div
          className="w-6 h-6 rounded-[7px] flex items-center justify-center shrink-0"
          style={{ background: `${accent}14` }}
        >
          <Icon size={12} style={{ color: accent }} />
        </div>
      </div>
      {progress !== undefined && (
        <div className="relative mt-2.5">
          <MiniBar value={progress} max={100} height={3} />
        </div>
      )}
    </motion.button>
  );
}

function ServerRow({
  server,
  sample,
  index,
  onClick,
  onTerminal,
}: {
  server: ServerRecord;
  sample?: MetricSample;
  index: number;
  onClick: () => void;
  onTerminal: () => void;
}) {
  const prov = PROVIDER_META[server.origin] ?? PROVIDER_META.manual;
  const memPct = sample?.memTotal ? ((sample.memUsed ?? 0) / sample.memTotal) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.08 + index * 0.03, duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClick}
      className="row-interactive px-4 py-2.5 flex items-center gap-3 group shrink-0 border-b border-[rgba(16,24,40,0.045)] last:border-b-0"
    >
      <StatusDot status={server.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[12.5px] font-medium text-[#12171f] truncate">{server.name}</span>
          <span
            className="text-[9.5px] px-1 py-[1px] rounded shrink-0 font-medium"
            style={{ color: prov.color, background: prov.bg }}
          >
            {prov.short}
          </span>
        </div>
        <p className="text-[10.5px] text-[#a8b0bd] font-mono mt-0.5 truncate">
          {server.host}:{server.port}
          {server.os ? <span className="ml-2 text-[#c4cad3]">{server.os}</span> : null}
        </p>
      </div>

      {sample && server.status === 'online' ? (
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-[74px]">
            <div className="flex justify-between text-[9.5px] text-[#8b94a3] mb-1">
              <span>CPU</span>
              <span className="font-mono text-[#5b6473]">{fmtPercent(sample.cpu)}</span>
            </div>
            <MiniBar value={sample.cpu ?? 0} max={100} height={4} />
          </div>
          <div className="w-[74px]">
            <div className="flex justify-between text-[9.5px] text-[#8b94a3] mb-1">
              <span>MEM</span>
              <span className="font-mono text-[#5b6473]">{memPct.toFixed(0)}%</span>
            </div>
            <MiniBar value={memPct} max={100} height={4} />
          </div>
        </div>
      ) : (
        <span className="text-[10.5px] text-[#c4cad3] shrink-0">—</span>
      )}

      <div className="flex items-center gap-2 shrink-0 w-[100px] justify-end">
        {server.latencyMs ? (
          <span
            className="text-[9.5px] font-mono px-1.5 py-0.5 rounded-[4px] font-medium"
            style={{
              color: server.latencyMs < 80 ? '#0f9d70' : server.latencyMs < 200 ? '#b45309' : '#dc2f4b',
              background: server.latencyMs < 80 ? 'rgba(15,157,112,0.08)' : server.latencyMs < 200 ? 'rgba(180,83,9,0.08)' : 'rgba(220,47,75,0.08)',
            }}
          >
            {server.latencyMs}ms
          </span>
        ) : null}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTerminal();
          }}
          title="打开终端"
          className="p-1 rounded text-[#8b94a3] opacity-0 group-hover:opacity-100 hover:text-[#0f9d70] hover:bg-[rgba(15,157,112,0.1)] transition-all duration-150"
        >
          <TerminalSquare size={12} />
        </button>
      </div>
    </motion.div>
  );
}

function ResourceRow({
  icon: Icon,
  label,
  value,
  pct,
  color,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  pct: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="flex items-center gap-1.5 text-[11px] text-[#5b6473]">
          <Icon size={11} style={{ color }} />
          {label}
        </span>
        <span className="text-[11px] font-mono text-[#2c3543]">{value}</span>
      </div>
      <div className="h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(16,24,40,0.06)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, pct)}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  desc,
  color,
  onClick,
}: {
  icon: typeof Zap;
  label: string;
  desc: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="panel px-3.5 py-3 text-left flex items-center gap-2.5 group overflow-hidden relative"
    >
      {/* hover 时的柔光，与 StatCard 语言一致。
          opacity 必须交给 className 的 group-hover 控制：写内联 opacity:0 会覆盖 Tailwind，
          导致 hover 柔光永远不显示。 */}
      <div
        className="absolute -top-6 -right-6 w-16 h-16 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ background: color, filter: 'blur(20px)' }}
      />
      <div
        className="w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105"
        style={{ background: `${color}14`, border: `1px solid ${color}20` }}
      >
        <Icon size={14} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-[11.5px] font-medium text-[#12171f] leading-tight truncate">{label}</p>
        <p className="text-[10px] text-[#a8b0bd] mt-[3px] leading-tight truncate">{desc}</p>
      </div>
    </motion.button>
  );
}
