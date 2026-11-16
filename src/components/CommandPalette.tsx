import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server,
  TerminalSquare,
  LayoutDashboard,
  Cloud,
  Activity,
  Layers,
  Bell,
  Settings,
  Plus,
  RefreshCw,
  CornerDownLeft,
  Sparkles,
  Play,
  Loader2,
  Copy,
  Check,
} from 'lucide-react';
import { useApp, type Route } from '@/stores/app';
import { StatusDot } from './Primitives';
import { unwrap, cleanError } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  onAddServer: () => void;
  onRefresh: () => void;
}

const QUICK_PROMPTS = [
  { label: '⚡ 查看系统负载', cmd: '> uptime && free -h' },
  { label: '💾 检查根分区余量', cmd: '> df -h /' },
  { label: '🐳 列出运行容器', cmd: '> docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"' },
  { label: '🔍 扫描监听端口', cmd: '> ss -tulpn | head -n 15' },
  { label: '🔥 Top 5 CPU 进程', cmd: '> ps -eo pid,user,%cpu,%mem,comm --sort=-%cpu | head -n 6' },
];

export function CommandPalette({ open, onClose, onAddServer, onRefresh }: Props) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [runningCmd, setRunningCmd] = useState(false);
  const [cmdOutput, setCmdOutput] = useState<{ cmd: string; results: Array<{ name: string; ok: boolean; out: string; ms: number }> } | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const servers = useApp((s) => s.servers);
  const navigate = useApp((s) => s.navigate);
  const openTerminalTab = useApp((s) => s.openTerminalTab);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setCmdOutput(null);
      setRunningCmd(false);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  // 全局快捷键 ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const executeQuickShell = async (rawCmd: string) => {
    const cleanCmd = rawCmd.replace(/^>\s*/, '').trim();
    if (!cleanCmd) return;
    const targets = servers.filter((s) => s.status === 'online');
    const targetIds = (targets.length ? targets : servers).map((s) => s.id);
    if (!targetIds.length) {
      setCmdOutput({
        cmd: cleanCmd,
        results: [{ name: '无可用服务器', ok: false, out: '尚未添加任何服务器，请先添加服务器。', ms: 0 }],
      });
      return;
    }

    setRunningCmd(true);
    try {
      const res = await unwrap(window.nebula.batch.exec(targetIds, cleanCmd));
      setCmdOutput({
        cmd: cleanCmd,
        results: res.map((r) => ({
          name: r.serverName,
          ok: r.ok,
          out: (r.stdout || r.stderr || '(执行成功，无输出)').trim(),
          ms: r.durationMs,
        })),
      });
    } catch (e) {
      setCmdOutput({
        cmd: cleanCmd,
        results: [{ name: '执行异常', ok: false, out: cleanError(e), ms: 0 }],
      });
    } finally {
      setRunningCmd(false);
    }
  };

  // 快捷页面列表
  const NAV_ITEMS: { key: Route['name']; label: string; icon: typeof LayoutDashboard; route: Route }[] = [
    { key: 'dashboard', label: '总览中心 Dashboard', icon: LayoutDashboard, route: { name: 'dashboard' } },
    { key: 'servers', label: '服务器资产 Servers', icon: Server, route: { name: 'servers' } },
    { key: 'terminal', label: '交互式终端 Terminal', icon: TerminalSquare, route: { name: 'terminal' } },
    { key: 'cloud', label: '多云资源同步 Cloud', icon: Cloud, route: { name: 'cloud' } },
    { key: 'monitor', label: '指标监控图表 Monitor', icon: Activity, route: { name: 'monitor' } },
    { key: 'batch', label: '批量运维编排 Batch', icon: Layers, route: { name: 'batch' } },
    { key: 'alerts', label: '告警中心 Alerts', icon: Bell, route: { name: 'alerts' } },
    { key: 'settings', label: '系统设置 Settings', icon: Settings, route: { name: 'settings' } },
  ];

  // 动作项
  const ACTION_ITEMS = [
    {
      id: 'act-add',
      label: '添加新服务器 (Add Server)',
      icon: Plus,
      action: () => {
        onClose();
        onAddServer();
      },
    },
    {
      id: 'act-refresh',
      label: '刷新全部数据 (Refresh Data)',
      icon: RefreshCw,
      action: () => {
        onClose();
        onRefresh();
      },
    },
  ];

  // 组合搜索结果列表
  const items = useMemo(() => {
    const raw = query.trim();
    const isShellMode = raw.startsWith('>');
    const q = raw.toLowerCase();
    const result: Array<{
      type: 'server' | 'nav' | 'action' | 'shell';
      id: string;
      title: string;
      sub?: string;
      icon?: any;
      status?: any;
      onRun: () => void;
      onTerminal?: () => void;
    }> = [];

    if (isShellMode) {
      const shellCmd = raw.replace(/^>\s*/, '').trim();
      result.push({
        type: 'shell',
        id: 'run-shell-direct',
        title: shellCmd ? `立即在在线主机上执行: ${shellCmd}` : '输入 Linux Shell 指令并按回车直接执行…',
        sub: `${servers.filter((s) => s.status === 'online').length || servers.length} 台目标节点`,
        icon: Play,
        onRun: () => {
          if (shellCmd) void executeQuickShell(shellCmd);
        },
      });
      return result;
    }

    // 1. 匹配服务器
    const matchedServers = servers.filter(
      (s) =>
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.host.toLowerCase().includes(q) ||
        s.username.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q))
    );
    for (const s of matchedServers.slice(0, 7)) {
      result.push({
        type: 'server',
        id: `srv-${s.id}`,
        title: s.name,
        sub: `${s.username}@${s.host}:${s.port}${s.tags.length ? ` · #${s.tags.join(' #')}` : ''}`,
        status: s.status,
        onRun: () => {
          onClose();
          navigate({ name: 'server', id: s.id });
        },
        onTerminal: () => {
          onClose();
          openTerminalTab(s.id);
        },
      });
    }

    // 2. 匹配导航页面
    const matchedNav = NAV_ITEMS.filter((n) => !q || n.label.toLowerCase().includes(q));
    for (const n of matchedNav) {
      result.push({
        type: 'nav',
        id: `nav-${n.key}`,
        title: n.label,
        icon: n.icon,
        onRun: () => {
          onClose();
          navigate(n.route);
        },
      });
    }

    // 3. 匹配快捷动作
    const matchedActions = ACTION_ITEMS.filter((a) => !q || a.label.toLowerCase().includes(q));
    for (const a of matchedActions) {
      result.push({
        type: 'action',
        id: a.id,
        title: a.label,
        icon: a.icon,
        onRun: a.action,
      });
    }

    // 4. 如果用户输入了任意非空文本，提供直接作为 Shell 命令执行的兜底项
    if (raw.length > 0) {
      result.push({
        type: 'shell',
        id: 'run-shell-fallback',
        title: `作为 Shell 指令执行: ${raw}`,
        sub: '直接下发至在线服务器并查看回显',
        icon: TerminalSquare,
        onRun: () => void executeQuickShell(raw),
      });
    }

    return result;
  }, [query, servers, navigate, openTerminalTab, onClose, onAddServer, onRefresh]);

  // 键盘快捷上下选择与 Enter
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((idx) => (idx + 1) % Math.max(1, items.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((idx) => (idx - 1 + items.length) % Math.max(1, items.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = items[selectedIndex];
      if (current) current.onRun();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="cmd-root"
          className="fixed inset-0 z-[160] flex items-start justify-center pt-[11vh] px-4"
          style={{ pointerEvents: open ? 'auto' : 'none' }}
        >
          {/* 背景遮罩（禁用 blur 保证软件渲染 150fps） */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
            className="absolute inset-0"
            style={{
              background: 'rgba(15, 23, 42, 0.36)',
              willChange: 'opacity',
            }}
          />

          {/* 指令浮窗面板 */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6, transition: { duration: 0.1 } }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex flex-col w-full max-w-[640px] rounded-[22px] overflow-hidden"
            style={{
              background: '#ffffff',
              border: '1px solid rgba(15, 23, 42, 0.09)',
              boxShadow: '0 16px 40px -12px rgba(15, 23, 42, 0.24)',
              willChange: 'transform, opacity',
            }}
          >
            {/* 顶栏搜索输入框 */}
            <div className="flex items-center gap-3 px-5 h-[56px] border-b border-[rgba(15,23,42,0.06)]">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background: 'linear-gradient(135deg, rgba(27,110,243,0.12) 0%, rgba(15,157,112,0.14) 100%)',
                }}
              >
                {runningCmd ? (
                  <Loader2 size={14} className="text-[#1b6ef3] animate-spin" />
                ) : (
                  <Sparkles size={14} className="text-[#1b6ef3]" />
                )}
              </div>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                  if (cmdOutput) setCmdOutput(null);
                }}
                onKeyDown={handleKeyDown}
                placeholder="搜索主机、功能跳转，或输入 > 命令 (如 > df -h) 即刻执行…"
                className="w-full h-full bg-transparent text-[14px] text-[#1f1f1f] outline-none placeholder-[#9aa0a6]"
              />
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-[#747775] bg-[#f0f4f9] border border-[rgba(15,23,42,0.07)]">
                ESC
              </span>
            </div>

            {/* 快捷指令建议胶囊栏 */}
            <div className="px-4 py-2.5 bg-[#f8fafd] border-b border-[rgba(15,23,42,0.05)] flex items-center gap-1.5 overflow-x-auto hide-scrollbar">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p.cmd}
                  onClick={() => {
                    setQuery(p.cmd);
                    void executeQuickShell(p.cmd);
                  }}
                  className="quick-chip shrink-0"
                >
                  <span>{p.label}</span>
                </button>
              ))}
            </div>

            {/* 如果刚刚执行了快捷命令，展示即时终端回显面板 */}
            {cmdOutput ? (
              <div className="p-4 bg-[#0d1117] text-[#e6edf3] font-mono text-[11.5px] max-h-[340px] overflow-y-auto space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#30363d]">
                  <span className="text-[#58a6ff] truncate">$ {cmdOutput.cmd}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        const text = cmdOutput.results.map((r) => `[${r.name}]\n${r.out}`).join('\n\n');
                        void navigator.clipboard.writeText(text);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                      className="px-2 py-0.5 rounded bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] text-[10.5px] flex items-center gap-1"
                    >
                      {copied ? <Check size={11} className="text-[#3fb950]" /> : <Copy size={11} />}
                      {copied ? '已复制' : '复制结果'}
                    </button>
                    <button
                      onClick={() => setCmdOutput(null)}
                      className="px-2 py-0.5 rounded bg-[#21262d] hover:bg-[#30363d] text-[#8b949e] text-[10.5px]"
                    >
                      返回列表
                    </button>
                  </div>
                </div>
                {cmdOutput.results.map((r, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className={r.ok ? 'text-[#3fb950] font-semibold' : 'text-[#f85149] font-semibold'}>
                        ● {r.name}
                      </span>
                      <span className="text-[#8b949e]">{r.ms} ms</span>
                    </div>
                    <pre className="p-2.5 rounded-xl bg-[#161b22] border border-[#30363d] whitespace-pre-wrap break-all text-[#c9d1d9] leading-relaxed">
                      {r.out}
                    </pre>
                  </div>
                ))}
              </div>
            ) : (
              /* 搜索结果列表 */
              <div className="max-h-[340px] overflow-y-auto p-2 space-y-0.5">
                {items.length === 0 ? (
                  <div className="py-10 text-center text-[12px] text-[#9aa0a6]">
                    未找到匹配结果
                  </div>
                ) : (
                  items.map((item, idx) => {
                    const active = idx === selectedIndex;
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.id}
                        onClick={item.onRun}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className="group flex items-center justify-between px-3.5 h-[44px] rounded-full cursor-pointer transition-colors duration-120"
                        style={{
                          background: active
                            ? 'linear-gradient(90deg, rgba(27,110,243,0.09) 0%, rgba(15,157,112,0.11) 100%)'
                            : 'transparent',
                          color: active ? '#1f1f1f' : '#444746',
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {item.type === 'server' ? (
                            <StatusDot status={item.status} size={7} />
                          ) : (
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                              style={{
                                background: active ? 'rgba(15,157,112,0.15)' : '#f0f4f9',
                                color: active ? '#0f9d70' : '#5b6473',
                              }}
                            >
                              <Icon size={13} />
                            </div>
                          )}
                          <span className="text-[12.5px] font-medium truncate">{item.title}</span>
                          {item.sub && (
                            <span className="text-[11px] text-[#9aa0a6] font-mono truncate">
                              {item.sub}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {item.type === 'server' && item.onTerminal && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                item.onTerminal?.();
                              }}
                              title="直接打开终端"
                              className="p-1.5 rounded-full text-[#747775] hover:text-[#0f9d70] hover:bg-[rgba(15,157,112,0.12)] transition-colors opacity-0 group-hover:opacity-100 mr-1"
                            >
                              <TerminalSquare size={13} />
                            </button>
                          )}
                          {active && (
                            <span className="flex items-center gap-1 text-[10.5px] font-mono text-[#0f9d70] pr-1">
                              <span>{item.type === 'shell' ? '运行' : '跳转'}</span>
                              <CornerDownLeft size={11} />
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* 底部按键提示栏 */}
            <div
              className="flex items-center justify-between px-5 h-[36px] border-t border-[rgba(15,23,42,0.05)] text-[10.5px] text-[#747775]"
              style={{ background: '#f8fafd' }}
            >
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-white border border-[rgba(15,23,42,0.08)] font-mono">↑</kbd>
                  <kbd className="px-1.5 py-0.5 rounded bg-white border border-[rgba(15,23,42,0.08)] font-mono">↓</kbd>
                  <span>选择</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-white border border-[rgba(15,23,42,0.08)] font-mono">↵</kbd>
                  <span>执行 / 跳转</span>
                </span>
                <span className="text-[#0f9d70] font-medium hidden sm:inline">
                  提示：输入 &gt; 可直接在所有在线节点运行命令
                </span>
              </div>
              <span className="font-mono text-[10px] aurora-text font-semibold">
                Tsuru Command Studio
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
