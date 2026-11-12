import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Cpu,
  MemoryStick,
  HardDrive,
  Activity,
  TerminalSquare,
  FolderTree,
  Gauge,
  RefreshCw,
  Loader2,
  Clock,
  Network,
  ListOrdered,
  Server as ServerIcon,
  Wrench,
  Check,
  Copy,
  Box,
  ShieldCheck,
  FileText,
  Search,
  Layers,
  ArrowRight,
  Zap,
  Play,
} from 'lucide-react';
import { useApp } from '@/stores/app';
import { StatusDot, Chip, EmptyState } from '@/components/Primitives';
import { Modal } from '@/components/Modal';
import { LineChart } from '@/components/LineChart';
import { TerminalTab } from '@/components/TerminalTab';
import { FileExplorer } from '@/components/FileExplorer';
import { ProcessManager } from '@/components/ProcessManager';
import { ServicesManager } from '@/components/ServicesManager';
import { DiagnosticsCenter } from '@/components/DiagnosticsCenter';
import { SystemLogsManager } from '@/components/SystemLogsManager';
import {
  PROVIDER_META,
  STATUS_META,
  fmtBytes,
  fmtPercent,
  fmtUptime,
  fmtRelative,
  fmtDateTime,
  unwrap,
  cleanError,
} from '@/lib/utils';
import type { MetricSample } from '@/types';

type TabKey = 'overview' | 'monitor' | 'processes' | 'services' | 'diagnostics' | 'logs' | 'terminal' | 'files';

const TABS: { key: TabKey; label: string; icon: typeof Cpu }[] = [
  { key: 'overview', label: '概览', icon: Gauge },
  { key: 'monitor', label: '监控', icon: Activity },
  { key: 'processes', label: '进程', icon: ListOrdered },
  { key: 'services', label: '服务与容器', icon: Box },
  { key: 'diagnostics', label: '⚡ 智能体检', icon: ShieldCheck },
  { key: 'logs', label: '📜 系统日志', icon: FileText },
  { key: 'terminal', label: '终端', icon: TerminalSquare },
  { key: 'files', label: '文件', icon: FolderTree },
];

export function ServerDetailPage({ serverId }: { serverId: string }) {
  const servers = useApp((s) => s.servers);
  const navigate = useApp((s) => s.navigate);
  const toast = useApp((s) => s.toast);
  const loadServers = useApp((s) => s.loadServers);

  const server = servers.find((s) => s.id === serverId);

  const [tab, setTab] = useState<TabKey>('overview');
  const [termVisited, setTermVisited] = useState(false);
  const [series, setSeries] = useState<MetricSample[]>([]);
  const [loading, setLoading] = useState(false);
  const [sampling, setSampling] = useState(false);

  const selectTab = (next: TabKey) => {
    if (next === 'terminal') setTermVisited(true);
    setTab(next);
  };

  const loadSeries = useCallback(async () => {
    try {
      const list = await unwrap(window.nebula.metrics.get(serverId));
      setSeries(list);
    } catch {
      /* ignore */
    }
  }, [serverId]);

  useEffect(() => {
    void loadSeries();
    // 每分钟同步一次历史，主进程后台每 15s 采一次
    const t = setInterval(() => void loadSeries(), 20_000);
    return () => clearInterval(t);
  }, [loadSeries]);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const r = await unwrap(window.nebula.servers.probe(serverId));
      await loadServers();
      await loadSeries();
      toast({ type: 'success', title: '已刷新', desc: `延迟 ${r.latencyMs} ms` });
    } catch (e) {
      toast({ type: 'error', title: '刷新失败', desc: cleanError(e) });
    } finally {
      setLoading(false);
    }
  };

  const handleSample = async () => {
    setSampling(true);
    try {
      await unwrap(window.nebula.metrics.sampleNow(serverId));
      await loadSeries();
      toast({ type: 'success', title: '已采集一次' });
    } catch (e) {
      toast({ type: 'error', title: '采集失败', desc: cleanError(e) });
    } finally {
      setSampling(false);
    }
  };

  if (!server) {
    return (
      <EmptyState
        icon={<ServerIcon size={22} color="#a8b0bd" />}
        title="服务器不存在"
        desc="可能已被移除"
        action={
          <button className="btn btn-ghost" onClick={() => navigate({ name: 'servers' })}>
            返回列表
          </button>
        }
      />
    );
  }

  const prov = PROVIDER_META[server.origin] ?? PROVIDER_META.manual;
  const latest = series[series.length - 1];
  const memPct = latest?.memTotal ? ((latest.memUsed ?? 0) / latest.memTotal) * 100 : 0;
  const diskPct = latest?.diskTotal ? ((latest.diskUsed ?? 0) / latest.diskTotal) * 100 : 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 头部 */}
      <div className="px-5 pt-3 pb-0 shrink-0 border-b" style={{ borderColor: 'rgba(16,24,40,0.06)' }}>
        <div className="flex items-start gap-3 mb-3">
          <button
            onClick={() => navigate({ name: 'servers' })}
            className="mt-0.5 p-1.5 -ml-1 rounded-lg text-[#8b94a3] hover:text-[#12171f] hover:bg-[rgba(16,24,40,0.06)] transition-all duration-150"
          >
            <ArrowLeft size={15} />
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[16px] font-semibold text-[#12171f] tracking-tight">{server.name}</h2>
              <Chip color={prov.color} bg={prov.bg}>
                {prov.short}
              </Chip>
              {server.region && (
                <Chip color="#6b7484" bg="rgba(16,24,40,0.045)" mono>
                  {server.region}
                </Chip>
              )}
              {server.tags.map((t) => (
                <span key={t} className="text-[10px] text-[#a8b0bd]">
                  #{t}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-3 mt-1 text-[11px] text-[#8b94a3] font-mono">
              <span className="flex items-center gap-1.5">
                <StatusDot status={server.status} size={6} />
                <span style={{ color: (STATUS_META[server.status] ?? STATUS_META.unknown).color }}>
                  {(STATUS_META[server.status] ?? STATUS_META.unknown).label}
                </span>
              </span>
              <span>
                {server.username}@{server.host}:{server.port}
              </span>
              {server.latencyMs ? <span>{server.latencyMs} ms</span> : null}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button className="btn btn-ghost" onClick={handleSample} disabled={sampling} style={{ height: 30 }}>
              {sampling ? <Loader2 size={12} className="animate-spin" /> : <Activity size={12} />}
              采样
            </button>
            <button className="btn btn-ghost" onClick={handleRefresh} disabled={loading} style={{ height: 30 }}>
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              刷新
            </button>
            <button
              className="btn btn-primary"
              style={{ height: 30 }}
              onClick={() => selectTab('terminal')}
            >
              <TerminalSquare size={12} />
              终端
            </button>
          </div>
        </div>

        {/* Tab 切换 */}
        <div className="flex items-center gap-0.5 relative" data-detail-tabs>
          {TABS.map((t) => {
            const active = tab === t.key;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => selectTab(t.key)}
                className="relative h-[32px] px-3 flex items-center gap-1.5"
                style={{ color: active ? '#12171f' : '#6b7484', transition: 'color 160ms' }}
              >
                <Icon size={12} className="relative z-10" />
                <span className="relative z-10 text-[12px]" style={{ fontWeight: active ? 550 : 450 }}>
                  {t.label}
                </span>
                {active && (
                  <motion.div
                    layoutId="detail-tab-underline"
                    className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                    style={{ background: '#0f9d70' }}
                    transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          {tab !== 'terminal' && (
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 overflow-y-auto"
            >
              {tab === 'overview' && (
                <Overview
                  server={server}
                  latest={latest}
                  memPct={memPct}
                  diskPct={diskPct}
                  seriesCount={series.length}
                  series={series}
                  onGoDiagnostics={() => selectTab('diagnostics')}
                />
              )}
              {tab === 'monitor' && <MonitorView series={series} />}
              {tab === 'processes' && <ProcessManager server={server} />}
              {tab === 'services' && <ServicesManager server={server} />}
              {tab === 'diagnostics' && <DiagnosticsCenter server={server} />}
              {tab === 'logs' && <SystemLogsManager server={server} />}
              {tab === 'files' && <FileExplorer serverId={server.id} />}
            </motion.div>
          )}
        </AnimatePresence>
        {(tab === 'terminal' || termVisited) && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={tab === 'terminal' ? { opacity: 1, y: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0"
            style={{
              pointerEvents: tab === 'terminal' ? 'auto' : 'none',
              zIndex: tab === 'terminal' ? 10 : -1,
            }}
          >
            <TerminalTab
              serverId={server.id}
              serverName={server.name}
              status={server.status}
              active={tab === 'terminal'}
              onClose={() => selectTab('overview')}
            />
          </motion.div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Overview({
  server,
  latest,
  memPct,
  diskPct,
  seriesCount,
  series,
  onGoDiagnostics,
}: {
  server: any;
  latest?: MetricSample;
  memPct: number;
  diskPct: number;
  seriesCount: number;
  series: MetricSample[];
  onGoDiagnostics: () => void;
}) {
  const [diagOutput, setDiagOutput] = useState<{ title: string; cmd: string; output: string } | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedIp, setCopiedIp] = useState(false);

  const runDiag = async (title: string, cmd: string) => {
    if (server.status === 'offline') return;
    setDiagLoading(true);
    try {
      const r = await unwrap(window.nebula.batch.exec([server.id], cmd));
      const first = r[0];
      setDiagOutput({
        title,
        cmd,
        output: first
          ? first.ok
            ? first.stdout || '(执行成功，无输出)'
            : first.stderr || '执行失败'
          : '未能获取执行结果',
      });
    } catch (e) {
      setDiagOutput({ title, cmd, output: cleanError(e) });
    } finally {
      setDiagLoading(false);
    }
  };

  const copyIp = () => {
    navigator.clipboard.writeText(server.host);
    setCopiedIp(true);
    setTimeout(() => setCopiedIp(false), 1500);
  };

  const cards = [
    {
      icon: Cpu,
      label: 'CPU 负载',
      value: fmtPercent(latest?.cpu),
      sub: latest?.processes ? `${latest.processes} 个运行中进程` : '—',
      color: '#7454d8',
      pct: latest?.cpu ?? 0,
    },
    {
      icon: MemoryStick,
      label: '物理内存',
      value: latest ? `${fmtBytes(latest.memUsed)} / ${fmtBytes(latest.memTotal)}` : '—',
      sub: `占用率 ${fmtPercent(memPct)}`,
      color: '#0891a8',
      pct: memPct,
    },
    {
      icon: HardDrive,
      label: '根磁盘空间 /',
      value: latest ? `${fmtBytes(latest.diskUsed)} / ${fmtBytes(latest.diskTotal)}` : '—',
      sub: `已使用 ${fmtPercent(diskPct)}`,
      color: '#0f9d70',
      pct: diskPct,
    },
    {
      icon: Clock,
      label: '系统已运行',
      value: fmtUptime(latest?.uptimeSec),
      sub: latest?.load1 !== undefined ? `平均负载 ${latest.load1.toFixed(2)}` : '—',
      color: '#d97706',
      pct: undefined,
    },
  ];

  return (
    <div className="h-full flex flex-col px-5 py-4 overflow-y-auto space-y-4">
      {/* 4 核心资源大卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        {cards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="panel px-4 py-3.5"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11.5px] font-semibold text-[#5b6473]">{c.label}</span>
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center"
                style={{ background: `${c.color}14` }}
              >
                <c.icon size={13} style={{ color: c.color }} />
              </div>
            </div>
            <p className="text-[20px] font-bold text-[#12171f] font-mono leading-tight truncate">
              {c.value}
            </p>
            <p className="text-[11px] text-[#8b94a3] mt-1">{c.sub}</p>
            {c.pct !== undefined && (
              <div className="mt-2.5 h-[4px] rounded-full overflow-hidden" style={{ background: 'rgba(16,24,40,0.06)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: c.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, c.pct)}%` }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* 智能运维体检与推荐诊断（醒目放置于中间黄金位置） */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.28 }}
        className="rounded-2xl border p-4 bg-white shadow-sm"
        style={{ borderColor: 'rgba(16,24,40,0.08)' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3.5 pb-3 border-b border-[rgba(16,24,40,0.06)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[rgba(15,157,112,0.1)] flex items-center justify-center text-[#0f9d70]">
              <Zap size={17} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[13.5px] font-bold text-[#12171f]">一键运维体检推荐</h3>
                <span className="text-[10.5px] px-2 py-0.5 rounded-full font-medium bg-[rgba(15,157,112,0.08)] text-[#0f9d70]">
                  快速排查
                </span>
              </div>
              <p className="text-[11.5px] text-[#8b94a3] mt-0.5">常用核心运维体检指令，点击即刻执行</p>
            </div>
          </div>

          <button
            onClick={onGoDiagnostics}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-[#0f9d70] hover:text-[#0b7c58] transition-colors shrink-0 group"
          >
            <span>进入全机深度体检与评分中心</span>
            <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        {/* 4 大核心体检大卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl border border-[rgba(16,24,40,0.06)] bg-[#fafbfc] hover:bg-white hover:border-[#0f9d70] transition-all flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] font-bold text-[#12171f] group-hover:text-[#0f9d70] transition-colors">
                  🔍 监听端口透视
                </span>
                <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-[rgba(8,145,168,0.1)] text-[#0891a8] font-medium">
                  网络
                </span>
              </div>
              <p className="text-[11px] text-[#6b7484] leading-relaxed">
                扫描所有 TCP/UDP 监听端口及对应进程，排查对外暴露
              </p>
            </div>
            <button
              onClick={() => runDiag('监听端口 (TCP/UDP)', 'ss -tulpn 2>/dev/null || netstat -tulpn')}
              disabled={diagLoading || server.status === 'offline'}
              className="mt-3 btn btn-ghost h-[28px] text-[11.5px] w-full flex items-center justify-center gap-1 border border-[rgba(16,24,40,0.08)] hover:bg-[#0f9d70] hover:text-white"
            >
              {diagLoading ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
              立即诊断
            </button>
          </div>

          <div className="p-3.5 rounded-xl border border-[rgba(16,24,40,0.06)] bg-[#fafbfc] hover:bg-white hover:border-[#0f9d70] transition-all flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] font-bold text-[#12171f] group-hover:text-[#0f9d70] transition-colors">
                  💾 磁盘大文件排查
                </span>
                <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-[rgba(15,157,112,0.1)] text-[#0f9d70] font-medium">
                  存储
                </span>
              </div>
              <p className="text-[11px] text-[#6b7484] leading-relaxed">
                秒级扫描根分区 &gt;100MB 巨型日志与文件，定位爆满根源
              </p>
            </div>
            <button
              onClick={() =>
                runDiag(
                  '排查大文件 (>100M)',
                  'find / -xdev -type f -size +100M -exec ls -lh {} + 2>/dev/null | sort -rh -k 5 | head -8'
                )
              }
              disabled={diagLoading || server.status === 'offline'}
              className="mt-3 btn btn-ghost h-[28px] text-[11.5px] w-full flex items-center justify-center gap-1 border border-[rgba(16,24,40,0.08)] hover:bg-[#0f9d70] hover:text-white"
            >
              {diagLoading ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
              立即诊断
            </button>
          </div>

          <div className="p-3.5 rounded-xl border border-[rgba(16,24,40,0.06)] bg-[#fafbfc] hover:bg-white hover:border-[#0f9d70] transition-all flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] font-bold text-[#12171f] group-hover:text-[#0f9d70] transition-colors">
                  🐳 Docker 状态审计
                </span>
                <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-[rgba(37,99,235,0.1)] text-[#2563eb] font-medium">
                  容器
                </span>
              </div>
              <p className="text-[11px] text-[#6b7484] leading-relaxed">
                查看宿主机运行中容器、端口映射与 Docker 系统卷占用
              </p>
            </div>
            <button
              onClick={() =>
                runDiag(
                  'Docker 容器清单',
                  'docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "未安装或未运行 Docker"'
                )
              }
              disabled={diagLoading || server.status === 'offline'}
              className="mt-3 btn btn-ghost h-[28px] text-[11.5px] w-full flex items-center justify-center gap-1 border border-[rgba(16,24,40,0.08)] hover:bg-[#0f9d70] hover:text-white"
            >
              {diagLoading ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
              立即诊断
            </button>
          </div>

          <div className="p-3.5 rounded-xl border border-[rgba(16,24,40,0.06)] bg-[#fafbfc] hover:bg-white hover:border-[#0f9d70] transition-all flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] font-bold text-[#12171f] group-hover:text-[#0f9d70] transition-colors">
                  🛡️ 登录与暴破审计
                </span>
                <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-[rgba(220,47,75,0.1)] text-[#dc2f4b] font-medium">
                  安全
                </span>
              </div>
              <p className="text-[11px] text-[#6b7484] leading-relaxed">
                排查终端登录来源 IP 与近期的 Failed password 爆破日志
              </p>
            </div>
            <button
              onClick={() =>
                runDiag(
                  '登录与安全审计',
                  'last -n 6 2>/dev/null; echo "=== 近期失败尝试 ==="; grep "Failed password" /var/log/secure 2>/dev/null | tail -n 6 || journalctl _SYSTEMD_UNIT=sshd.service -n 6 2>&1'
                )
              }
              disabled={diagLoading || server.status === 'offline'}
              className="mt-3 btn btn-ghost h-[28px] text-[11.5px] w-full flex items-center justify-center gap-1 border border-[rgba(16,24,40,0.08)] hover:bg-[#0f9d70] hover:text-white"
            >
              {diagLoading ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
              立即诊断
            </button>
          </div>
        </div>
      </motion.div>

      {/* 连接信息与系统规格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.28 }}
          className="panel px-4 py-3.5"
        >
          <div className="flex items-center justify-between mb-3 shrink-0">
            <h3 className="text-[13px] font-bold text-[#12171f]">连接信息</h3>
            <button
              onClick={copyIp}
              className="text-[11px] text-[#0f9d70] hover:underline flex items-center gap-1"
            >
              {copiedIp ? <Check size={11} /> : <Copy size={11} />}
              {copiedIp ? '已复制 IP' : '复制 IP'}
            </button>
          </div>
          <div className="flex flex-col gap-2.5">
            <KV label="主机地址" value={`${server.host}:${server.port}`} mono />
            <KV label="登录用户" value={server.username} mono />
            <KV
              label="认证方式"
              value={
                server.authMethod === 'password'
                  ? '密码认证'
                  : server.authMethod === 'privateKey'
                    ? '私钥认证'
                    : 'SSH Agent'
              }
            />
            <KV label="来源渠道" value={server.origin === 'manual' ? '手动录入' : PROVIDER_META[server.origin]?.name ?? server.origin} />
            {server.instanceId && <KV label="实例 ID" value={server.instanceId} mono />}
            {server.region && <KV label="云地域" value={server.region} mono />}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.28 }}
          className="panel px-4 py-3.5"
        >
          <h3 className="text-[13px] font-bold text-[#12171f] mb-3 shrink-0">系统与状态</h3>
          <div className="flex flex-col gap-2.5">
            <KV label="操作系统" value={server.os ?? '—'} />
            <KV label="最近活跃" value={fmtRelative(server.lastSeenAt)} />
            <KV label="添加时间" value={fmtDateTime(server.createdAt)} />
            <KV label="采样历史" value={`${seriesCount} 个样本点`} mono />
            {latest?.netRx !== undefined && (
              <KV label="累计流量" value={`↓ ${fmtBytes(latest.netRx)} · ↑ ${fmtBytes(latest.netTx)}`} mono />
            )}
            {server.note && <KV label="备注信息" value={server.note} />}
          </div>
        </motion.div>
      </div>

      {!latest && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-3 px-4 py-3 rounded-xl flex items-center gap-2.5 shrink-0"
          style={{ background: 'rgba(217,119,6,0.07)', border: '1px solid rgba(217,119,6,0.1)' }}
        >
          <Activity size={14} className="text-[#b45309] shrink-0" />
          <p className="text-[12px] text-[#92642a]">
            还没有采集到指标。后台每 15 秒自动采集一次，也可以点击右上角「采样」立即采集。
          </p>
        </motion.div>
      )}

      {/* 实时网络 + 负载趋势：吸收剩余高度 */}
      <NetworkStrip series={series} latest={latest} />

      {/* 诊断输出弹窗 */}
      <Modal
        open={Boolean(diagOutput)}
        onClose={() => setDiagOutput(null)}
        title={diagOutput?.title ?? '诊断结果'}
        subtitle={diagOutput?.cmd}
        width={680}
        footer={
          <>
            <button
              className="btn btn-ghost"
              onClick={() => {
                if (!diagOutput) return;
                void navigator.clipboard.writeText(diagOutput.output);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check size={12} className="text-[#0f9d70]" /> : <Copy size={12} />}
              {copied ? '已复制' : '复制输出'}
            </button>
            <button className="btn btn-primary" onClick={() => setDiagOutput(null)}>
              关闭
            </button>
          </>
        }
      >
        <div
          className="p-3.5 rounded-xl font-mono text-[11px] leading-relaxed max-h-[50vh] overflow-auto select-text whitespace-pre"
          style={{ background: '#0e131b', color: '#88e7b9', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {diagOutput?.output}
        </div>
      </Modal>
    </div>
  );
}

/** 概览页底部的实时网络 / 负载信息带 */
function NetworkStrip({ series, latest }: { series: MetricSample[]; latest?: MetricSample }) {
  const recent = series.slice(-40);
  const ts = recent.map((s) => s.t);

  // netRx/netTx 是累计字节，速率要靠相邻采样点差分
  const rxRate: (number | null)[] = [];
  const txRate: (number | null)[] = [];
  for (let i = 1; i < recent.length; i++) {
    const dt = (recent[i].t - recent[i - 1].t) / 1000;
    const cur = recent[i];
    const prev = recent[i - 1];
    if (dt <= 0 || cur.netRx === undefined || prev.netRx === undefined) {
      rxRate.push(null);
      txRate.push(null);
      continue;
    }
    rxRate.push(Math.max(0, (cur.netRx - prev.netRx) / dt));
    txRate.push(Math.max(0, ((cur.netTx ?? 0) - (prev.netTx ?? 0)) / dt));
  }
  // 首点补 null 让 x 轴长度与 timestamps 对齐
  rxRate.unshift(null);
  txRate.unshift(null);

  const curRx = rxRate[rxRate.length - 1] ?? 0;
  const curTx = txRate[txRate.length - 1] ?? 0;
  const load = recent.map((s) => (s.load1 !== undefined ? Number(s.load1.toFixed(2)) : null));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.24, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="grid grid-cols-[1fr_1fr] gap-3 flex-1 min-h-[180px] mt-3"
    >
      <div className="panel px-4 pt-3 pb-2 flex flex-col min-h-0">
        <div className="flex items-center gap-3 mb-1 shrink-0">
          <h3 className="text-[12px] font-medium text-[#12171f]">网络吞吐</h3>
          <div className="flex items-center gap-2.5 text-[10px]">
            <span className="flex items-center gap-1 text-[#5b6473]">
              <span className="w-[5px] h-[5px] rounded-full bg-[#0891a8]" />
              下行 <span className="font-mono">{fmtRate(curRx)}</span>
            </span>
            <span className="flex items-center gap-1 text-[#5b6473]">
              <span className="w-[5px] h-[5px] rounded-full bg-[#7454d8]" />
              上行 <span className="font-mono">{fmtRate(curTx)}</span>
            </span>
          </div>
        </div>
        {ts.length > 1 ? (
          <LineChart
            timestamps={ts}
            height="100%"
            yUnit=""
            yFormatter={(v) => fmtRate(v).replace('/s', '')}
            valueFormatter={(v) => fmtRate(v)}
            series={[
              { name: '网络下行', data: rxRate, color: '#0891a8', area: true },
              { name: '网络上行', data: txRate, color: '#7454d8' },
            ]}
          />
        ) : (
          <div className="flex-1 grid place-items-center">
            <p className="text-[11px] text-[#a8b0bd]">采样点不足，稍后再看</p>
          </div>
        )}
      </div>

      <div className="panel px-4 pt-3 pb-2 flex flex-col min-h-0">
        <div className="flex items-center gap-3 mb-1 shrink-0">
          <h3 className="text-[12px] font-medium text-[#12171f]">系统负载（1 分钟）</h3>
          <span className="text-[10px] font-mono text-[#5b6473]">
            当前 {latest?.load1 !== undefined ? latest.load1.toFixed(2) : '—'}
          </span>
        </div>
        {ts.length > 1 ? (
          <LineChart
            timestamps={ts}
            height="100%"
            yUnit=""
            series={[{ name: '负载', data: load, color: '#d97706', area: true }]}
          />
        ) : (
          <div className="flex-1 grid place-items-center">
            <p className="text-[11px] text-[#a8b0bd]">采样点不足，稍后再看</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/** 把字节/秒格式化成可读速率 */
function fmtRate(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec < 1) return '0 B/s';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  let v = bytesPerSec;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[11.5px] text-[#8b94a3] shrink-0">{label}</span>
      <span
        className={`text-[11.5px] text-[#2c3543] text-right break-all ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MonitorView({ series }: { series: MetricSample[] }) {
  if (series.length === 0) {
    return (
      <EmptyState
        icon={<Activity size={22} color="#a8b0bd" />}
        title="暂无监控数据"
        desc="连接成功并采集到第一个样本后，这里会显示 CPU、内存、磁盘与网络的实时曲线。"
      />
    );
  }

  const ts = series.map((s) => s.t);
  const cpu = series.map((s) => (s.cpu !== undefined ? Number(s.cpu.toFixed(2)) : null));
  const mem = series.map((s) =>
    s.memTotal ? Number((((s.memUsed ?? 0) / s.memTotal) * 100).toFixed(2)) : null,
  );
  const disk = series.map((s) =>
    s.diskTotal ? Number((((s.diskUsed ?? 0) / s.diskTotal) * 100).toFixed(2)) : null,
  );
  const load = series.map((s) => (s.load1 !== undefined ? Number(s.load1.toFixed(2)) : null));

  // 网络速率：相邻采样点的差值 / 时间差
  const rxRate: (number | null)[] = [];
  const txRate: (number | null)[] = [];
  for (let i = 0; i < series.length; i++) {
    if (i === 0) {
      rxRate.push(null);
      txRate.push(null);
      continue;
    }
    const dt = (series[i].t - series[i - 1].t) / 1000;
    const drx = (series[i].netRx ?? 0) - (series[i - 1].netRx ?? 0);
    const dtx = (series[i].netTx ?? 0) - (series[i - 1].netTx ?? 0);
    // 计数器回绕或重启时会出现负值，直接丢弃
    rxRate.push(dt > 0 && drx >= 0 ? Number(((drx / dt) * 8 / 1024).toFixed(1)) : null);
    txRate.push(dt > 0 && dtx >= 0 ? Number(((dtx / dt) * 8 / 1024).toFixed(1)) : null);
  }

  return (
    <div className="px-5 py-4 space-y-3">
      <ChartCard title="CPU 使用率" unit="%" legend={[{ name: 'CPU', color: '#7454d8' }]}>
        <LineChart
          timestamps={ts}
          yMax={100}
          yUnit="%"
          series={[{ name: 'CPU', data: cpu, color: '#7454d8', area: true }]}
        />
      </ChartCard>

      <ChartCard title="内存使用率" unit="%" legend={[{ name: '内存', color: '#0891a8' }]}>
        <LineChart
          timestamps={ts}
          yMax={100}
          yUnit="%"
          series={[{ name: '内存', data: mem, color: '#0891a8', area: true }]}
        />
      </ChartCard>

      <ChartCard title="磁盘使用率" unit="%" legend={[{ name: '磁盘 /', color: '#0f9d70' }]}>
        <LineChart
          timestamps={ts}
          yMax={100}
          yUnit="%"
          series={[{ name: '磁盘', data: disk, color: '#0f9d70', area: true }]}
        />
      </ChartCard>

      <div className="grid grid-cols-2 gap-3">
        <ChartCard title="系统负载（1 分钟）" legend={[{ name: 'load', color: '#d97706' }]}>
          <LineChart
            timestamps={ts}
            height={150}
            series={[{ name: '负载', data: load, color: '#d97706', area: true }]}
          />
        </ChartCard>

        <ChartCard
          title="网络吞吐"
          legend={[
            { name: '下行', color: '#0891a8' },
            { name: '上行', color: '#8b72e8' },
          ]}
        >
          <div className="flex items-center gap-3 px-1 pb-1">
            <span className="flex items-center gap-1 text-[10px] text-[#a8b0bd]">
              <Network size={9} /> Kbps
            </span>
          </div>
          <LineChart
            timestamps={ts}
            height={130}
            showRightAxis={false}
            valueFormatter={(v) => `${v.toFixed(1)} Kbps`}
            series={[
              { name: '网络下行', data: rxRate, color: '#0891a8', area: true },
              { name: '网络上行', data: txRate, color: '#8b72e8', area: true },
            ]}
          />
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  legend,
  children,
}: {
  title: string;
  unit?: string;
  legend: { name: string; color: string }[];
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="panel px-3.5 pt-3 pb-1.5"
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[11.5px] font-medium text-[#2c3543]">{title}</h3>
        <div className="flex items-center gap-2.5">
          {legend.map((l) => (
            <span key={l.name} className="flex items-center gap-1 text-[10px] text-[#8b94a3]">
              <span className="w-[6px] h-[6px] rounded-full" style={{ background: l.color }} />
              {l.name}
            </span>
          ))}
        </div>
      </div>
      {children}
    </motion.div>
  );
}
