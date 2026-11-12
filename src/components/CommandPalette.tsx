import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
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
  ArrowRight,
  CornerDownLeft,
} from 'lucide-react';
import { useApp, type Route } from '@/stores/app';
import { StatusDot } from './Primitives';

interface Props {
  open: boolean;
  onClose: () => void;
  onAddServer: () => void;
  onRefresh: () => void;
}

export function CommandPalette({ open, onClose, onAddServer, onRefresh }: Props) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const servers = useApp((s) => s.servers);
  const navigate = useApp((s) => s.navigate);
  const openTerminalTab = useApp((s) => s.openTerminalTab);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
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

  // 快捷页面列表
  const NAV_ITEMS: { key: Route['name']; label: string; icon: typeof LayoutDashboard; route: Route }[] = [
    { key: 'dashboard', label: '总览 Dashboard', icon: LayoutDashboard, route: { name: 'dashboard' } },
    { key: 'servers', label: '服务器列表 Servers', icon: Server, route: { name: 'servers' } },
    { key: 'terminal', label: '多机终端 Terminal', icon: TerminalSquare, route: { name: 'terminal' } },
    { key: 'cloud', label: '云资源同步 Cloud', icon: Cloud, route: { name: 'cloud' } },
    { key: 'monitor', label: '监控图表 Monitor', icon: Activity, route: { name: 'monitor' } },
    { key: 'batch', label: '批量运维 Batch', icon: Layers, route: { name: 'batch' } },
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
    const q = query.trim().toLowerCase();
    const result: Array<{
      type: 'server' | 'nav' | 'action';
      id: string;
      title: string;
      sub?: string;
      icon?: any;
      status?: any;
      onRun: () => void;
      onTerminal?: () => void;
    }> = [];

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
          className="fixed inset-0 z-[160] flex items-start justify-center pt-[14vh] px-4"
          style={{ pointerEvents: open ? 'auto' : 'none' }}
        >
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
            className="absolute inset-0"
            style={{
              background: 'rgba(16,24,40,0.36)',
              willChange: 'opacity',
            }}
          />

          {/* 指令浮窗面板 */}
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99, transition: { duration: 0.12 } }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex flex-col w-full max-w-[580px] rounded-2xl overflow-hidden"
            style={{
              background: '#ffffff',
              border: '1px solid rgba(16,24,40,0.1)',
              boxShadow: '0 24px 72px -16px rgba(16,24,40,0.32), 0 0 0 1px rgba(16,24,40,0.04)',
              willChange: 'transform, opacity',
            }}
          >
            {/* 顶栏搜索输入框 */}
            <div className="flex items-center gap-3 px-4 h-[50px] border-b border-[rgba(16,24,40,0.06)]">
              <Search size={16} className="text-[#8b94a3] shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="搜索服务器、指令或快捷导航…"
                className="w-full h-full bg-transparent text-[13.5px] text-[#12171f] outline-none placeholder-[#a8b0bd]"
              />
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-[#8b94a3] bg-[rgba(16,24,40,0.05)] border border-[rgba(16,24,40,0.08)]">
                ESC
              </span>
            </div>

            {/* 结果列表 */}
            <div className="max-h-[360px] overflow-y-auto p-1.5 space-y-0.5">
              {items.length === 0 ? (
                <div className="py-10 text-center text-[12px] text-[#a8b0bd]">
                  未找到任何匹配结果
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
                      className="group flex items-center justify-between px-3 h-[42px] rounded-xl cursor-pointer transition-colors duration-120"
                      style={{
                        background: active ? 'rgba(15,157,112,0.08)' : 'transparent',
                        color: active ? '#12171f' : '#5b6473',
                      }}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {item.type === 'server' ? (
                          <StatusDot status={item.status} size={6} />
                        ) : (
                          <div
                            className="w-6 h-6 rounded-[7px] flex items-center justify-center shrink-0"
                            style={{
                              background: active ? 'rgba(15,157,112,0.14)' : 'rgba(16,24,40,0.04)',
                              color: active ? '#0f9d70' : '#8b94a3',
                            }}
                          >
                            <Icon size={13} />
                          </div>
                        )}
                        <span className="text-[12.5px] font-medium truncate">{item.title}</span>
                        {item.sub && (
                          <span className="text-[10.5px] text-[#a8b0bd] font-mono truncate">
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
                            className="p-1 rounded text-[#8b94a3] hover:text-[#0f9d70] hover:bg-[rgba(15,157,112,0.1)] transition-colors opacity-0 group-hover:opacity-100 mr-1"
                          >
                            <TerminalSquare size={13} />
                          </button>
                        )}
                        {active && (
                          <span className="flex items-center gap-1 text-[10px] font-mono text-[#0f9d70]">
                            <span>跳转</span>
                            <CornerDownLeft size={11} />
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* 底部按键提示栏 */}
            <div
              className="flex items-center justify-between px-4 h-[34px] border-t border-[rgba(16,24,40,0.05)] text-[10.5px] text-[#8b94a3]"
              style={{ background: '#fafbfc' }}
            >
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 rounded bg-[rgba(16,24,40,0.05)] border border-[rgba(16,24,40,0.08)] font-mono">↑</kbd>
                  <kbd className="px-1 py-0.5 rounded bg-[rgba(16,24,40,0.05)] border border-[rgba(16,24,40,0.08)] font-mono">↓</kbd>
                  <span>选择</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 rounded bg-[rgba(16,24,40,0.05)] border border-[rgba(16,24,40,0.08)] font-mono">↵</kbd>
                  <span>确认</span>
                </span>
              </div>
              <span className="font-mono text-[10px] text-[#a8b0bd]">
                Tsuru Console · 全局指令中心
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
