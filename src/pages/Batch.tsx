import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Loader2, CheckSquare, Square, Terminal, Trash2, Copy, Check } from 'lucide-react';
import { useApp } from '@/stores/app';
import { EmptyState, StatusDot, Chip } from '@/components/Primitives';
import { unwrap, cleanError } from '@/lib/utils';
import type { BatchExecResult } from '@/types';

const PRESETS = [
  { group: '健康', label: '磁盘占用', cmd: 'df -h' },
  { group: '健康', label: '内存状态', cmd: 'free -h' },
  { group: '健康', label: '系统负载', cmd: 'uptime' },
  { group: '健康', label: 'CPU Top 进程', cmd: 'ps aux --sort=-%cpu | head -6' },
  { group: '网络', label: '监听端口', cmd: 'ss -tulpn 2>/dev/null || netstat -tulpn' },
  { group: '网络', label: '连接状态统计', cmd: "netstat -an 2>/dev/null | awk '/^tcp/ {++S[$NF]} END {for(a in S) print a, S[a]}'" },
  { group: '容器', label: 'Docker 容器', cmd: 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"' },
  { group: '排查', label: '大文件 (>100M)', cmd: 'find / -xdev -type f -size +100M -exec ls -lh {} + 2>/dev/null | sort -rh -k 5 | head -5' },
  { group: '安全', label: '最近登录', cmd: 'last -n 5' },
];

export function BatchPage() {
  const servers = useApp((s) => s.servers);
  const toast = useApp((s) => s.toast);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [command, setCommand] = useState('');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<BatchExecResult[] | null>(null);

  const toggle = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    if (selected.size === servers.length) setSelected(new Set());
    else setSelected(new Set(servers.map((s) => s.id)));
  };

  const handleRun = async () => {
    if (!selected.size) {
      toast({ type: 'warn', title: '请先选择目标服务器' });
      return;
    }
    if (!command.trim()) {
      toast({ type: 'warn', title: '请输入要执行的命令' });
      return;
    }
    setRunning(true);
    setResults(null);
    try {
      const r = await unwrap(window.nebula.batch.exec([...selected], command));
      setResults(r);
      const okCount = r.filter((x) => x.ok).length;
      toast({
        type: okCount === r.length ? 'success' : 'warn',
        title: '执行完成',
        desc: `${okCount} / ${r.length} 台成功`,
      });
    } catch (e) {
      toast({ type: 'error', title: '批量执行失败', desc: cleanError(e) });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="h-full flex overflow-hidden">
      {/* 左：目标选择 */}
      <div
        className="w-[248px] shrink-0 flex flex-col border-r overflow-hidden"
        style={{ borderColor: 'rgba(16,24,40,0.06)' }}
      >
        <div className="flex items-center justify-between px-3 h-[38px] shrink-0 border-b" style={{ borderColor: 'rgba(16,24,40,0.06)' }}>
          <button
            onClick={toggleAll}
            className="flex items-center gap-1.5 text-[11px] text-[#6b7484] hover:text-[#12171f] transition-colors duration-150"
          >
            {selected.size === servers.length && servers.length > 0 ? (
              <CheckSquare size={12} className="text-[#0f9d70]" />
            ) : (
              <Square size={12} />
            )}
            全选
          </button>
          <Chip color="#0f9d70" bg="rgba(15,157,112,0.1)">
            已选 {selected.size}
          </Chip>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {servers.length === 0 ? (
            <p className="px-3 py-4 text-[11px] text-[#a8b0bd]">还没有服务器</p>
          ) : (
            servers.map((s, i) => {
              const active = selected.has(s.id);
              return (
                <motion.button
                  key={s.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.18), duration: 0.2 }}
                  onClick={() => toggle(s.id)}
                  className="w-full flex items-center gap-2 px-3 h-[44px] text-left transition-colors duration-150"
                  style={{ background: active ? 'rgba(15,157,112,0.07)' : undefined }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = 'rgba(16,24,40,0.045)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = active ? 'rgba(15,157,112,0.07)' : 'transparent';
                  }}
                >
                  <span
                    className="w-[13px] h-[13px] rounded-[3px] flex items-center justify-center shrink-0 transition-all duration-150"
                    style={{
                      background: active ? '#0f9d70' : 'transparent',
                      border: active ? '1px solid #0f9d70' : '1px solid rgba(16,24,40,0.2)',
                    }}
                  >
                    {active && <Check size={9} color="#ffffff" strokeWidth={3.5} />}
                  </span>
                  <StatusDot status={s.status} size={5} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11.5px] text-[#2c3543] truncate leading-tight">{s.name}</div>
                    <div className="text-[9.5px] text-[#a8b0bd] font-mono truncate leading-tight mt-[2px]">
                      {s.host}
                    </div>
                  </div>
                </motion.button>
              );
            })
          )}
          {/* 列表下方的补充说明，避免左栏底部空一大片 */}
          <div className="px-3 pt-3 pb-2">
            <p className="text-[10px] leading-relaxed" style={{ color: '#c4cad3' }}>
              命令按顺序逐台执行，单台超时会跳过并继续下一台。离线机器会直接返回失败。
            </p>
          </div>
        </div>

        {/* 底部统计条 */}
        <div
          className="shrink-0 px-3 h-[30px] flex items-center gap-2 border-t"
          style={{ borderColor: 'rgba(16,24,40,0.06)', background: 'rgba(16,24,40,0.015)' }}
        >
          <span className="text-[10px] text-[#8b94a3]">
            共 {servers.length} 台 · 已选 {selected.size}
          </span>
          <div className="flex-1" />
          <span className="flex items-center gap-1 text-[10px] text-[#a8b0bd]">
            <span className="w-[5px] h-[5px] rounded-full bg-[#0f9d70]" />
            {servers.filter((s) => s.status === 'online').length} 在线
          </span>
        </div>
      </div>

      {/* 右：命令 + 结果 */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="px-4 pt-3 pb-3 shrink-0 border-b" style={{ borderColor: 'rgba(16,24,40,0.06)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Terminal size={12} className="text-[#8b94a3]" />
            <span className="text-[11.5px] text-[#5b6473]">批量命令</span>
            <div className="flex-1" />
            <span className="text-[10px] text-[#a8b0bd]">在 {selected.size} 台机器上串行执行</span>
          </div>

          <div className="flex gap-2">
            <textarea
              className="field font-mono flex-1 text-[12px]"
              rows={2}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="输入 shell 命令，例如：df -h"
              spellCheck={false}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void handleRun();
                }
              }}
            />
            <button
              className="btn btn-primary shrink-0"
              onClick={() => void handleRun()}
              disabled={running}
              style={{ height: 'auto', padding: '0 14px' }}
            >
              {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              {running ? '执行中' : '执行'}
            </button>
          </div>

          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span className="text-[10px] text-[#a8b0bd] mr-0.5">常用指令:</span>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setCommand(p.cmd)}
                className="h-[21px] px-2 rounded-[5px] text-[10.5px] transition-all duration-150 flex items-center gap-1"
                style={{ background: 'rgba(16,24,40,0.035)', color: '#6b7484' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(15,157,112,0.1)';
                  e.currentTarget.style.color = '#0f9d70';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(16,24,40,0.035)';
                  e.currentTarget.style.color = '#6b7484';
                }}
                title={p.cmd}
              >
                <span className="text-[9px] px-1 rounded bg-[rgba(16,24,40,0.05)] text-[#8b94a3]">{p.group}</span>
                <span>{p.label}</span>
              </button>
            ))}
            <span className="text-[10px] text-[#c4cad3] ml-auto">Ctrl + Enter 执行</span>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
          {!results ? (
            <div className="h-full grid place-items-center">
              <EmptyState
                icon={<Play size={20} color="#a8b0bd" />}
                title="还没有执行结果"
                desc="选择左侧服务器，输入命令后点「执行」。结果会按机器分别展示，便于对比。"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-[#8b94a3]">
                  执行结果 · {results.filter((r) => r.ok).length} / {results.length} 成功
                </span>
                <button
                  onClick={() => setResults(null)}
                  className="flex items-center gap-1 text-[10.5px] text-[#8b94a3] hover:text-[#12171f] transition-colors duration-150"
                >
                  <Trash2 size={10} />
                  清空
                </button>
              </div>
              {results.map((r, i) => (
                <ResultCard key={r.serverId} result={r} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultCard({ result, index }: { result: BatchExecResult; index: number }) {
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(result.stdout || result.stderr);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3), duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-[10px] overflow-hidden"
      style={{
        background: 'rgba(16,24,40,0.025)',
        border: `1px solid ${result.ok ? 'rgba(15,157,112,0.1)' : 'rgba(220,47,75,0.16)'}`,
      }}
    >
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center gap-2 px-3 h-[32px] text-left"
      >
        <StatusDot status={result.ok ? 'online' : 'offline'} size={5} />
        <span className="text-[11.5px] text-[#12171f] font-medium">{result.serverName}</span>
        <span className="text-[10px] font-mono text-[#a8b0bd]">
          退出码 {result.code ?? 'N/A'} · {result.durationMs} ms
        </span>
        <div className="flex-1" />
        <span
          onClick={(e) => {
            e.stopPropagation();
            void copy();
          }}
          className="p-1 rounded text-[#8b94a3] hover:text-[#12171f] transition-colors duration-150"
        >
          {copied ? <Check size={10} className="text-[#0f9d70]" /> : <Copy size={10} />}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.pre
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-auto px-3 pb-2.5 text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-all"
            style={{ color: '#3d4655', maxHeight: 280 }}
          >
            {result.stdout || (
              <span className="text-[#a8b0bd]">（无输出）</span>
            )}
            {result.stderr && (
              <span style={{ color: '#dc2f4b' }}>{'\n' + result.stderr}</span>
            )}
          </motion.pre>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
