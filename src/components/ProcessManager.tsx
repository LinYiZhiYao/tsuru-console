import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  RefreshCw,
  Loader2,
  Trash2,
  AlertTriangle,
  Flame,
  HardDrive,
  Cpu,
} from 'lucide-react';
import { useApp } from '@/stores/app';
import { unwrap, cleanError } from '@/lib/utils';
import type { ProcessInfo, ServerRecord } from '@/types';

interface Props {
  server: ServerRecord;
}

export function ProcessManager({ server }: Props) {
  const toast = useApp((s) => s.toast);

  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'cpu' | 'mem' | 'pid'>('cpu');
  const [killingPid, setKillingPid] = useState<number | null>(null);

  const loadProcesses = useCallback(async () => {
    if (server.status === 'offline') return;
    setLoading(true);
    try {
      const data = await unwrap(window.nebula.servers.processes(server.id));
      setProcesses(data);
    } catch (e) {
      toast({ type: 'error', title: '获取进程列表失败', desc: cleanError(e) });
    } finally {
      setLoading(false);
    }
  }, [server.id, server.status, toast]);

  useEffect(() => {
    void loadProcesses();
  }, [loadProcesses]);

  const handleKill = async (proc: ProcessInfo, signal: 'TERM' | 'KILL' = 'TERM') => {
    const isKill = signal === 'KILL';
    const msg = isKill
      ? `确定强制杀死进程 PID: ${proc.pid} (${proc.comm})？(SIGKILL -9)`
      : `确定终止进程 PID: ${proc.pid} (${proc.comm})？(SIGTERM -15)`;
    if (!confirm(msg)) return;

    setKillingPid(proc.pid);
    try {
      await unwrap(window.nebula.servers.killProcess(server.id, proc.pid, signal));
      toast({
        type: 'success',
        title: isKill ? '已发送强制终止信号' : '已发送终止信号',
        desc: `PID ${proc.pid} (${proc.comm})`,
      });
      // 延时 600ms 刷新列表
      setTimeout(() => void loadProcesses(), 600);
    } catch (e) {
      toast({ type: 'error', title: '终止进程失败', desc: cleanError(e) });
    } finally {
      setKillingPid(null);
    }
  };

  const filtered = useMemo(() => {
    let list = processes.filter((p) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        String(p.pid).includes(q) ||
        p.user.toLowerCase().includes(q) ||
        p.comm.toLowerCase().includes(q) ||
        p.args.toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      if (sortBy === 'cpu') return b.cpu - a.cpu;
      if (sortBy === 'mem') return b.mem - a.mem;
      return a.pid - b.pid;
    });

    return list;
  }, [processes, query, sortBy]);

  return (
    <div className="h-full flex flex-col p-5 overflow-hidden">
      {/* 顶部过滤控制台 */}
      <div className="flex items-center gap-2 mb-3.5 shrink-0">
        <div className="relative flex-1 max-w-[280px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#a8b0bd]" />
          <input
            className="field pl-8"
            style={{ height: 30 }}
            placeholder="搜索进程名、PID、用户、参数…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* 排序方式 */}
        <div
          className="flex p-[3px] rounded-[8px]"
          style={{ background: 'rgba(16,24,40,0.04)', border: '1px solid rgba(16,24,40,0.055)' }}
        >
          {(
            [
              ['cpu', '按 CPU 排序', Flame],
              ['mem', '按内存排序', HardDrive],
              ['pid', '按 PID 排序', Cpu],
            ] as const
          ).map(([k, label, Icon]) => (
            <button
              key={k}
              onClick={() => setSortBy(k)}
              className="flex items-center gap-1.5 px-2.5 h-[24px] rounded-[6px] text-[11px] transition-all duration-150"
              style={{
                color: sortBy === k ? '#12171f' : '#6b7484',
                background: sortBy === k ? 'rgba(16,24,40,0.08)' : 'transparent',
                fontWeight: sortBy === k ? 550 : 450,
              }}
            >
              <Icon size={11} className={sortBy === k ? 'text-[#0f9d70]' : ''} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <span className="text-[11px] text-[#8b94a3] font-mono mr-1">
          共 {filtered.length} 个活跃进程
        </span>

        <button
          className="btn btn-ghost"
          style={{ height: 30 }}
          onClick={() => void loadProcesses()}
          disabled={loading || server.status === 'offline'}
          title="刷新进程列表"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          刷新
        </button>
      </div>

      {/* 进程列表主体 */}
      <div className="flex-1 min-h-0 panel overflow-hidden flex flex-col">
        {server.status === 'offline' ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <AlertTriangle size={24} className="text-[#a8b0bd] mb-2" />
            <p className="text-[13px] font-medium text-[#12171f]">服务器处于离线状态</p>
            <p className="text-[11px] text-[#8b94a3] mt-1">请先确保 SSH 连通后再查看实时进程</p>
          </div>
        ) : loading && processes.length === 0 ? (
          <div className="flex-1 flex items-center justify-center gap-2 text-[#8b94a3]">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-[12px]">正在采集活跃进程快照…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-[12px] text-[#a8b0bd]">
            没有匹配的进程
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10" style={{ background: '#fafbfc' }}>
                <tr>
                  <th className="th w-[80px]">PID</th>
                  <th className="th w-[100px]">用户</th>
                  <th className="th w-[110px]">CPU 占用</th>
                  <th className="th w-[110px]">内存占用</th>
                  <th className="th w-[180px]">程序命令</th>
                  <th className="th">启动参数 / 路径</th>
                  <th className="th text-right w-[110px]">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((proc) => {
                  const isBusyCpu = proc.cpu > 20;
                  const isBusyMem = proc.mem > 20;
                  return (
                    <tr key={proc.pid} className="row-interactive group">
                      <td className="td font-mono text-[11.5px] font-semibold text-[#12171f]">
                        {proc.pid}
                      </td>
                      <td className="td text-[11.5px] text-[#6b7484] truncate">
                        {proc.user}
                      </td>
                      <td className="td font-mono text-[11.5px]">
                        <span
                          className="font-medium"
                          style={{
                            color: isBusyCpu ? '#dc2f4b' : proc.cpu > 5 ? '#b45309' : '#0f9d70',
                          }}
                        >
                          {proc.cpu.toFixed(1)}%
                        </span>
                      </td>
                      <td className="td font-mono text-[11.5px]">
                        <span
                          className="font-medium"
                          style={{
                            color: isBusyMem ? '#dc2f4b' : proc.mem > 5 ? '#b45309' : '#0891a8',
                          }}
                        >
                          {proc.mem.toFixed(1)}%
                        </span>
                      </td>
                      <td className="td font-medium text-[12px] text-[#12171f] truncate max-w-[180px]">
                        {proc.comm}
                      </td>
                      <td className="td font-mono text-[11px] text-[#8b94a3] truncate max-w-[420px]" title={proc.args}>
                        {proc.args}
                      </td>
                      <td className="td text-right">
                        <div
                          className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => void handleKill(proc, 'TERM')}
                            disabled={killingPid === proc.pid}
                            className="px-2 py-1 rounded text-[10.5px] text-[#6b7484] hover:text-[#dc2f4b] hover:bg-[rgba(220,47,75,0.08)] transition-all duration-120"
                            title="正常终止进程 (SIGTERM 15)"
                          >
                            终止
                          </button>
                          <button
                            onClick={() => void handleKill(proc, 'KILL')}
                            disabled={killingPid === proc.pid}
                            className="p-1 rounded text-[#dc2f4b] hover:bg-[rgba(220,47,75,0.12)] transition-all duration-120"
                            title="强制杀死进程 (SIGKILL -9)"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
