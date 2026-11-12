import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Plus, RefreshCw, Search } from 'lucide-react';
import { useApp } from '@/stores/app';
import { useEffect, useState } from 'react';

/** 每个路由对应的标题与副标题 */
const TITLES: Record<string, { title: string; sub: string }> = {
  dashboard: { title: '总览', sub: '所有纳管资源的状态摘要' },
  servers: { title: '服务器', sub: '纳管的服务器列表与连接管理' },
  server: { title: '服务器详情', sub: '实时监控、终端与文件' },
  terminal: { title: '终端', sub: '在多台服务器上开 SSH 会话' },
  cloud: { title: '云资源', sub: 'AWS / 阿里云实例同步与电源操作' },
  monitor: { title: '监控', sub: '指标曲线与采样历史' },
  batch: { title: '批量运维', sub: '一次命令，多机执行' },
  alerts: { title: '告警', sub: '阈值规则与告警记录' },
  settings: { title: '设置', sub: '凭据、存储与关于' },
};

interface TitleBarProps {
  onAddServer?: () => void;
  onRefresh?: () => void;
  onOpenPalette?: () => void;
}

/**
 * 顶部标题栏。
 * 左侧是拖拽区（Electron titleBarStyle: hidden），右侧是操作按钮。
 * 标题切换时做交叉淡入 + 轻微上移，避免文字「闪一下」。
 */
export function TitleBar({ onAddServer, onRefresh, onOpenPalette }: TitleBarProps) {
  const route = useApp((s) => s.route);
  const meta = TITLES[route.name] ?? TITLES.dashboard;
  const unacked = useApp((s) => s.unackedCount);
  const navigate = useApp((s) => s.navigate);

  // 当前时间，每秒刷新，作为「应用还在跑」的活体指示
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header
      className="drag-region h-[52px] flex items-center justify-between pl-5 shrink-0 border-b"
      style={{
        borderColor: 'rgba(16,24,40,0.06)',
        background: '#ffffff',
        // 右侧给 Windows 原生窗口控制按钮（最小化/最大化/关闭）留位。
        // titleBarOverlay 的按钮是浮在 webContents 之上的，不留位会被盖住。
        paddingRight: 148,
      }}
    >
      <div className="min-w-0 relative h-full flex flex-col justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={route.name}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <h1 className="text-[14px] font-semibold text-[#12171f] leading-tight tracking-tight">
              {meta.title}
            </h1>
            <p className="text-[10.5px] text-[#a8b0bd] leading-tight mt-0.5">{meta.sub}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-1.5 no-drag">
        {/* 全局命令与搜索快捷入口 */}
        <button
          onClick={onOpenPalette}
          className="flex items-center gap-2 h-[28px] px-2.5 mr-1 rounded-lg text-[11.5px] text-[#8b94a3] hover:text-[#12171f] hover:bg-[rgba(16,24,40,0.06)] border border-[rgba(16,24,40,0.07)] transition-all duration-150"
          title="全局快速搜索 / 指令面板 (Ctrl+K)"
        >
          <Search size={12} className="text-[#8b94a3]" />
          <span className="hidden sm:inline">搜索或输入指令…</span>
          <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[rgba(16,24,40,0.05)] border border-[rgba(16,24,40,0.08)] leading-none">
            Ctrl K
          </kbd>
        </button>

        <div className="hidden md:flex items-center gap-1.5 mr-1 text-[10.5px] font-mono text-[#a8b0bd]">
          <span className="w-[5px] h-[5px] rounded-full bg-[#0f9d70] animate-pulse" />
          {now.toLocaleTimeString('zh-CN', { hour12: false })}
        </div>

        <button
          onClick={onRefresh}
          className="p-1.5 rounded-lg text-[#6b7484] hover:text-[#12171f] hover:bg-[rgba(16,24,40,0.06)] transition-all duration-150"
          title="刷新"
        >
          <RefreshCw size={14} />
        </button>

        <button
          onClick={() => navigate({ name: 'alerts' })}
          className="relative p-1.5 rounded-lg text-[#6b7484] hover:text-[#12171f] hover:bg-[rgba(16,24,40,0.06)] transition-all duration-150"
          title="告警"
        >
          <Bell size={14} />
          <AnimatePresence>
            {unacked > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: 'spring', stiffness: 600, damping: 20 }}
                className="absolute top-1 right-1 w-[6px] h-[6px] rounded-full"
                style={{ background: '#dc2f4b', boxShadow: '0 0 8px rgba(220,47,75,0.7)' }}
              />
            )}
          </AnimatePresence>
        </button>

        {onAddServer && (
          <button
            onClick={onAddServer}
            className="btn btn-primary ml-1"
            style={{ height: 30, padding: '0 11px' }}
          >
            <Plus size={13} strokeWidth={2.6} />
            添加服务器
          </button>
        )}
      </div>
    </header>
  );
}
