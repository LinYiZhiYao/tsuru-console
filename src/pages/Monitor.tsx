import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, RefreshCw, Loader2, Server as ServerIcon, ChevronDown } from 'lucide-react';
import { useApp } from '@/stores/app';
import { EmptyState, StatusDot, Chip } from '@/components/Primitives';
import { LineChart } from '@/components/LineChart';
import { unwrap, cleanError, fmtBytes, fmtPercent, fmtUptime } from '@/lib/utils';
import type { MetricSample } from '@/types';

const RANGES = [
  { key: '15m', label: '15 分钟', ms: 15 * 60_000 },
  { key: '1h', label: '1 小时', ms: 60 * 60_000 },
  { key: '6h', label: '6 小时', ms: 6 * 60 * 60_000 },
] as const;

type RangeKey = (typeof RANGES)[number]['key'];

export function MonitorPage() {
  const servers = useApp((s) => s.servers);
  const toast = useApp((s) => s.toast);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>('15m');
  const [series, setSeries] = useState<MetricSample[]>([]);
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  /* 默认选第一台在线的机器 */
  useEffect(() => {
    if (selectedId || servers.length === 0) return;
    const online = servers.find((s) => s.status === 'online') ?? servers[0];
    setSelectedId(online.id);
  }, [servers, selectedId]);

  const load = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      const list = await unwrap(window.nebula.metrics.get(selectedId));
      setSeries(list);
    } catch (e) {
      toast({ type: 'error', title: '读取监控数据失败', desc: cleanError(e) });
    } finally {
      setLoading(false);
    }
  }, [selectedId, toast]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 20_000);
    return () => clearInterval(t);
  }, [load]);

  const rangeMs = RANGES.find((r) => r.key === range)!.ms;
  const cutoff = Date.now() - rangeMs;
  const visible = series.filter((s) => s.t >= cutoff);

  const server = servers.find((s) => s.id === selectedId);
  const latest = visible[visible.length - 1];

  const ts = visible.map((s) => s.t);
  const cpu = visible.map((s) => (s.cpu !== undefined ? Number(s.cpu.toFixed(2)) : null));
  const mem = visible.map((s) =>
    s.memTotal ? Number((((s.memUsed ?? 0) / s.memTotal) * 100).toFixed(2)) : null,
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 工具栏 */}
      <div
        className="flex items-center gap-2 px-5 h-[52px] shrink-0 border-b"
        style={{ borderColor: 'rgba(16,24,40,0.06)' }}
      >
        {/* 服务器选择器 */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex items-center gap-2 h-[30px] px-3 rounded-[8px] text-[12px] transition-colors duration-150"
            style={{ background: 'rgba(16,24,40,0.03)', border: '1px solid rgba(16,24,40,0.1)', color: '#12171f' }}
          >
            {server ? (
              <>
                <StatusDot status={server.status} size={6} />
                <span className="max-w-[160px] truncate">{server.name}</span>
              </>
            ) : (
              <span className="text-[#8b94a3]">选择服务器</span>
            )}
            <ChevronDown size={12} className="text-[#8b94a3]" />
          </button>

          <AnimatePresence>
            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setDropdownOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.99, transition: { duration: 0.12 } }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute top-[34px] left-0 z-30 w-[240px] rounded-[10px] overflow-hidden py-1"
                  style={{
                    background: '#ffffff',
                    border: '1px solid rgba(16,24,40,0.09)',
                    boxShadow: '0 16px 48px -12px rgba(16,24,40,0.24)',
                  }}
                >
                  {servers.length === 0 && (
                    <p className="px-3 py-2 text-[11.5px] text-[#a8b0bd]">没有可用服务器</p>
                  )}
                  {servers.map((s, i) => (
                    <motion.button
                      key={s.id}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.015, duration: 0.16 }}
                      onClick={() => {
                        setSelectedId(s.id);
                        setDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 h-[30px] text-left transition-colors duration-150 hover:bg-[rgba(16,24,40,0.05)]"
                      style={{ background: s.id === selectedId ? 'rgba(15,157,112,0.07)' : undefined }}
                    >
                      <StatusDot status={s.status} size={5} />
                      <span className="text-[11.5px] text-[#12171f] truncate flex-1">{s.name}</span>
                      <span className="text-[9.5px] text-[#a8b0bd] font-mono shrink-0">{s.host}</span>
                    </motion.button>
                  ))}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* 时间范围：滑动指示块 */}
        <div
          className="flex p-[3px] rounded-[8px] relative"
          style={{ background: 'rgba(16,24,40,0.04)', border: '1px solid rgba(16,24,40,0.055)' }}
        >
          {RANGES.map((r) => {
            const active = range === r.key;
            return (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className="relative px-2.5 h-[24px] rounded-[6px] text-[11px]"
                style={{ color: active ? '#12171f' : '#6b7484', transition: 'color 180ms' }}
              >
                {active && (
                  <motion.div
                    layoutId="range-toggle"
                    className="absolute inset-0 rounded-[6px] bg-[rgba(16,24,40,0.09)]"
                    transition={{ type: 'spring', stiffness: 560, damping: 40 }}
                  />
                )}
                <span className="relative">{r.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1" />
        <span className="text-[10.5px] text-[#a8b0bd] font-mono">{visible.length} 个采样点</span>
        <button className="btn btn-ghost" onClick={() => void load()} style={{ height: 30 }}>
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        </button>
      </div>

      {/* 图表区 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        {!selectedId ? (
          <div className="h-full grid place-items-center">
            <EmptyState
              icon={<Activity size={22} color="#a8b0bd" />}
              title="请选择一台服务器"
              desc="选择后即可查看该机器的指标历史曲线"
            />
          </div>
        ) : visible.length === 0 ? (
          <div className="h-full grid place-items-center">
            <EmptyState
              icon={<Activity size={22} color="#a8b0bd" />}
              title="该时间范围内没有数据"
              desc={
                server?.status === 'online'
                  ? '后台每 15 秒采集一次，稍等片刻再刷新。'
                  : '这台服务器当前不在线，无法采集指标。'
              }
            />
          </div>
        ) : (
          <div className="max-w-[1200px] h-full min-h-[560px] flex flex-col gap-3">
            {/* 顶部摘要 */}
            <div className="grid grid-cols-4 gap-3 shrink-0">
              <SummaryCard label="CPU" value={fmtPercent(latest?.cpu)} color="#7454d8" />
              <SummaryCard
                label="内存"
                value={latest ? `${fmtBytes(latest.memUsed)} / ${fmtBytes(latest.memTotal)}` : '—'}
                color="#0891a8"
              />
              <SummaryCard
                label="磁盘"
                value={latest ? `${fmtBytes(latest.diskUsed)} / ${fmtBytes(latest.diskTotal)}` : '—'}
                color="#0f9d70"
              />
              <SummaryCard label="运行时间" value={fmtUptime(latest?.uptimeSec)} color="#d97706" />
            </div>

            <div className="panel px-3.5 pt-3 pb-1.5 flex-1 min-h-[190px] flex flex-col">
              <ChartHeader title="CPU 与内存" legend={[
                { name: 'CPU', color: '#7454d8' },
                { name: '内存', color: '#0891a8' },
              ]} />
              <LineChart
                timestamps={ts}
                yMax={100}
                yUnit="%"
                height="100%"
                series={[
                  { name: 'CPU', data: cpu, color: '#7454d8', area: true },
                  { name: '内存', data: mem, color: '#0891a8', area: true },
                ]}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 flex-1 min-h-[150px]">
              <div className="panel px-3.5 pt-3 pb-1.5 flex flex-col">
                <ChartHeader title="磁盘使用率" legend={[{ name: '磁盘', color: '#0f9d70' }]} />
                <LineChart
                  timestamps={ts}
                  yMax={100}
                  yUnit="%"
                  height="100%"
                  series={[
                    {
                      name: '磁盘',
                      data: visible.map((s) =>
                        s.diskTotal ? Number((((s.diskUsed ?? 0) / s.diskTotal) * 100).toFixed(2)) : null,
                      ),
                      color: '#0f9d70',
                      area: true,
                    },
                  ]}
                />
              </div>
              <div className="panel px-3.5 pt-3 pb-1.5 flex flex-col">
                <ChartHeader title="系统负载" legend={[{ name: 'load1', color: '#d97706' }]} />
                <LineChart
                  timestamps={ts}
                  height="100%"
                  series={[
                    {
                      name: '负载',
                      data: visible.map((s) => (s.load1 !== undefined ? Number(s.load1.toFixed(2)) : null)),
                      color: '#d97706',
                      area: true,
                    },
                  ]}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className="panel px-3.5 py-2.5"
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="w-[5px] h-[5px] rounded-full" style={{ background: color }} />
        <span className="text-[10.5px] text-[#8b94a3]">{label}</span>
      </div>
      <p className="text-[12.5px] font-medium text-[#12171f] font-mono truncate">{value}</p>
    </motion.div>
  );
}

function ChartHeader({ title, legend }: { title: string; legend: { name: string; color: string }[] }) {
  return (
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
  );
}
