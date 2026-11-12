import { useState, useEffect, useRef } from 'react';
import {
  FileText,
  RefreshCw,
  Search,
  Copy,
  Check,
  Loader2,
  TerminalSquare,
  AlertCircle,
  Filter,
  ArrowDownCircle,
  Layers,
  Shield,
  Activity,
} from 'lucide-react';
import { unwrap, cleanError } from '@/lib/utils';
import type { ServerRecord } from '@/types';

interface LogPreset {
  id: string;
  name: string;
  cmd: string;
  icon: typeof FileText;
  color: string;
}

const PRESETS: LogPreset[] = [
  {
    id: 'journal',
    name: '系统主日志 (Systemd Journal)',
    cmd: 'journalctl -n {LINES} --no-pager 2>&1',
    icon: FileText,
    color: '#0f9d70',
  },
  {
    id: 'kernel',
    name: '内核消息 (dmesg)',
    cmd: 'dmesg -T 2>&1 | tail -n {LINES}',
    icon: Activity,
    color: '#0891a8',
  },
  {
    id: 'ssh',
    name: 'SSH 安全与登录日志',
    cmd: 'journalctl -u sshd -n {LINES} --no-pager 2>&1 || journalctl -u ssh -n {LINES} --no-pager 2>&1 || tail -n {LINES} /var/log/secure 2>&1 || tail -n {LINES} /var/log/auth.log 2>&1',
    icon: Shield,
    color: '#7454d8',
  },
  {
    id: 'docker',
    name: 'Docker 守护进程日志',
    cmd: 'journalctl -u docker -n {LINES} --no-pager 2>&1 || tail -n {LINES} /var/log/docker.log 2>&1',
    icon: Layers,
    color: '#2563eb',
  },
  {
    id: 'errors',
    name: '仅看系统报错 (Error/Emerg)',
    cmd: 'journalctl -p err..emerg -n {LINES} --no-pager 2>&1',
    icon: AlertCircle,
    color: '#dc2f4b',
  },
];

export function SystemLogsManager({ server }: { server: ServerRecord }) {
  const [activePreset, setActivePreset] = useState<LogPreset>(PRESETS[0]);
  const [lineCount, setLineCount] = useState<number>(150);
  const [logContent, setLogContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async (preset = activePreset, lines = lineCount) => {
    setLoading(true);
    try {
      const realCmd = preset.cmd.replace(/{LINES}/g, String(lines));
      const res = await unwrap(window.nebula.servers.exec(server.id, realCmd, 25000));
      setLogContent(res.stdout || res.stderr || '（无日志输出）');
    } catch (e) {
      setLogContent(`[获取日志失败]: ${cleanError(e)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLogs();
  }, [activePreset.id, lineCount]);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logContent, autoScroll]);

  const copyLogs = () => {
    navigator.clipboard.writeText(logContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // 过滤展示
  const filteredLines = query
    ? logContent.split('\n').filter((l) => l.toLowerCase().includes(query.toLowerCase()))
    : logContent.split('\n');

  return (
    <div className="p-6 space-y-4 max-w-[1300px] mx-auto select-text flex flex-col h-full">
      {/* 顶部工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-[rgba(16,24,40,0.08)] shadow-sm">
        {/* 预设切换 Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {PRESETS.map((p) => {
            const active = activePreset.id === p.id;
            const Icon = p.icon;
            return (
              <button
                key={p.id}
                onClick={() => {
                  setActivePreset(p);
                  void fetchLogs(p);
                }}
                className={`flex items-center gap-1.5 px-3 h-[32px] rounded-xl text-[12px] font-medium transition-all shrink-0 ${
                  active
                    ? 'bg-[#12171f] text-white shadow-sm'
                    : 'text-[#5b6473] hover:bg-[rgba(16,24,40,0.05)] hover:text-[#12171f]'
                }`}
              >
                <Icon size={13} style={{ color: active ? '#ffffff' : p.color }} />
                <span>{p.name}</span>
              </button>
            );
          })}
        </div>

        {/* 筛选与操作 */}
        <div className="flex items-center gap-2.5">
          {/* 行数选择 */}
          <select
            value={lineCount}
            onChange={(e) => setLineCount(Number(e.target.value))}
            className="field text-[11.5px] px-2"
            style={{ height: 32 }}
          >
            <option value={50}>最近 50 行</option>
            <option value={150}>最近 150 行</option>
            <option value={300}>最近 300 行</option>
            <option value={500}>最近 500 行</option>
          </select>

          {/* 关键字过滤 */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#a8b0bd]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="过滤日志内容…"
              className="field pl-8 text-[12px] w-[160px] sm:w-[200px]"
              style={{ height: 32 }}
            />
          </div>

          <button
            onClick={() => void fetchLogs()}
            disabled={loading}
            className="btn btn-ghost h-[32px] px-2.5 text-[12px] flex items-center gap-1.5"
            title="刷新日志"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">刷新</span>
          </button>

          <button
            onClick={copyLogs}
            className="btn btn-ghost h-[32px] px-2.5 text-[12px] flex items-center gap-1.5"
            title="复制日志"
          >
            {copied ? <Check size={13} className="text-[#0f9d70]" /> : <Copy size={13} />}
            <span className="hidden sm:inline">{copied ? '已复制' : '复制'}</span>
          </button>
        </div>
      </div>

      {/* 日志终端显示面板 */}
      <div className="flex-1 rounded-2xl border border-[rgba(16,24,40,0.08)] bg-[#0d1117] overflow-hidden flex flex-col shadow-sm min-h-[480px]">
        {/* 控制条 */}
        <div className="px-4 py-2 bg-[#161b22] border-b border-[#30363d] flex items-center justify-between text-[11px] text-[#8b949e]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 font-mono text-[#58a6ff]">
              <TerminalSquare size={13} />
              {activePreset.name}
            </span>
            <span>· 共 {filteredLines.length} 行输出</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`px-2 py-0.5 rounded text-[10.5px] transition-colors ${
                autoScroll ? 'bg-[#238636] text-white' : 'bg-[#21262d] text-[#8b949e]'
              }`}
            >
              自动滚底 {autoScroll ? '开' : '关'}
            </button>
          </div>
        </div>

        {/* 日志代码区 */}
        <div
          ref={logContainerRef}
          className="flex-1 p-4 font-mono text-[11.5px] leading-[1.65] text-[#c9d1d9] overflow-y-auto"
        >
          {loading && !logContent ? (
            <div className="flex flex-col items-center justify-center py-20 text-[#8b949e] gap-2">
              <Loader2 size={24} className="text-[#58a6ff] animate-spin" />
              <p>正在读取服务器日志…</p>
            </div>
          ) : filteredLines.length === 0 ? (
            <div className="py-12 text-center text-[#8b949e]">没有匹配的日志行</div>
          ) : (
            filteredLines.map((line, idx) => {
              const isError = /error|fail|crit|emerg|fatal/i.test(line);
              const isWarn = /warn/i.test(line);
              return (
                <div
                  key={idx}
                  className={`flex gap-3 hover:bg-[#161b22] px-1 rounded ${
                    isError ? 'text-[#ff7b72] bg-[rgba(248,81,73,0.06)]' : isWarn ? 'text-[#d29922]' : ''
                  }`}
                >
                  <span className="select-none text-[#484f58] w-9 text-right shrink-0 text-[10.5px]">
                    {idx + 1}
                  </span>
                  <span className="break-all whitespace-pre-wrap flex-1">{line}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
