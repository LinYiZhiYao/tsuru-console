import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Plus, RefreshCw, Sparkles } from 'lucide-react';
import { useApp } from '@/stores/app';
import { useEffect, useState, memo } from 'react';

/** 每个路由对应的标题与副标题 */
const TITLES: Record<string, { title: string; sub: string }> = {
  dashboard: { title: '总览中心', sub: '全域云主机状态、指标与快速指令' },
  servers: { title: '服务器资产', sub: '纳管节点列表、连通性探测与管理' },
  server: { title: '节点工作台', sub: '实时指标、智能体检、系统日志与终端' },
  terminal: { title: '交互式终端', sub: '多标签并发 SSH 会话矩阵' },
  cloud: { title: '多云资源', sub: 'AWS / 阿里云实例同步与电源控制' },
  monitor: { title: '指标监控', sub: '多维历史时序曲线与负载透视' },
  batch: { title: '批量运维', sub: '一次编排，多节点并发执行' },
  alerts: { title: '告警中心', sub: '动态阈值策略与异常事件追踪' },
  settings: { title: '系统设置', sub: '安全凭据库、数据存储与版本信息' },
};

interface TitleBarProps {
  onAddServer?: () => void;
  onRefresh?: () => void;
  onOpenPalette?: () => void;
}

/** 独立时钟组件，避免每秒触发整条标题栏重渲染 */
const LiveClock = memo(function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="hidden lg:flex items-center gap-1.5 mr-1 px-2.5 py-1 rounded-full bg-white border border-[rgba(15,23,42,0.06)] text-[10.5px] font-mono text-[#5b6473]">
      <span className="w-[6px] h-[6px] rounded-full bg-[#0f9d70]" />
      {now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}
    </div>
  );
});

/**
 * 顶部标题栏（融合居中智能指令舱入口）。
 */
export function TitleBar({ onAddServer, onRefresh, onOpenPalette }: TitleBarProps) {
  const route = useApp((s) => s.route);
  const meta = TITLES[route.name] ?? TITLES.dashboard;
  const unacked = useApp((s) => s.unackedCount);
  const navigate = useApp((s) => s.navigate);

  return (
    <header
      className="drag-region h-[54px] flex items-center justify-between pl-4 shrink-0"
      style={{
        background: '#f0f4f9',
        paddingRight: 148,
      }}
    >
      {/* 左侧当前视图标题 */}
      <div className="min-w-[160px] relative h-full flex flex-col justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={route.name}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
          >
            <h1 className="text-[14.5px] font-bold text-[#1f1f1f] leading-tight tracking-tight">
              {meta.title}
            </h1>
            <p className="text-[10.5px] text-[#747775] leading-tight mt-0.5 truncate">{meta.sub}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 中部：全局智能指令舱入口 */}
      <div className="flex-1 max-w-[440px] mx-4 no-drag hidden sm:block">
        <button
          onClick={onOpenPalette}
          className="omni-bar w-full h-[35px] px-3.5 flex items-center justify-between text-left group"
          title="呼出全局指令与快速执行舱 (Ctrl+K)"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Sparkles
              size={14}
              className="text-[#1b6ef3] group-hover:scale-110 transition-transform duration-150 shrink-0"
            />
            <span className="text-[12px] text-[#5b6473] group-hover:text-[#1f1f1f] truncate transition-colors duration-150">
              搜索主机、跳转功能，或输入 <code className="font-mono text-[#0f9d70]">&gt; 命令</code> 直接执行…
            </span>
          </div>
          <kbd className="px-2 py-0.5 rounded-full text-[10px] font-mono text-[#5b6473] bg-[#f0f4f9] border border-[rgba(15,23,42,0.08)] leading-none shrink-0 ml-2">
            Ctrl K
          </kbd>
        </button>
      </div>

      {/* 右侧快捷工具区 */}
      <div className="flex items-center gap-1.5 no-drag">
        <LiveClock />

        <button
          onClick={onRefresh}
          className="w-8 h-8 rounded-full flex items-center justify-center text-[#5b6473] hover:text-[#1f1f1f] hover:bg-white transition-colors duration-150"
          title="全局刷新"
        >
          <RefreshCw size={14} />
        </button>

        <button
          onClick={() => navigate({ name: 'alerts' })}
          className="relative w-8 h-8 rounded-full flex items-center justify-center text-[#5b6473] hover:text-[#1f1f1f] hover:bg-white transition-colors duration-150"
          title="告警中心"
        >
          <Bell size={14} />
          <AnimatePresence>
            {unacked > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ duration: 0.16 }}
                className="absolute top-1.5 right-1.5 w-[6.5px] h-[6.5px] rounded-full"
                style={{ background: '#dc2f4b' }}
              />
            )}
          </AnimatePresence>
        </button>

        {onAddServer && (
          <button
            onClick={onAddServer}
            className="btn btn-primary ml-1"
            style={{ height: 32, padding: '0 13px' }}
          >
            <Plus size={13} strokeWidth={2.5} />
            添加服务器
          </button>
        )}
      </div>
    </header>
  );
}
