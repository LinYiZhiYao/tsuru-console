import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Server,
  TerminalSquare,
  Cloud,
  Activity,
  Layers,
  Bell,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  Plus,
} from 'lucide-react';
import { useApp, type Route } from '@/stores/app';
import { CraneLogo } from '@/components/CraneLogo';

const NAV: { key: Route['name']; label: string; icon: typeof LayoutDashboard; route: Route }[] = [
  { key: 'dashboard', label: '总览', icon: LayoutDashboard, route: { name: 'dashboard' } },
  { key: 'servers', label: '服务器', icon: Server, route: { name: 'servers' } },
  { key: 'terminal', label: '终端', icon: TerminalSquare, route: { name: 'terminal' } },
  { key: 'cloud', label: '云资源', icon: Cloud, route: { name: 'cloud' } },
  { key: 'monitor', label: '监控', icon: Activity, route: { name: 'monitor' } },
  { key: 'batch', label: '批量运维', icon: Layers, route: { name: 'batch' } },
  { key: 'alerts', label: '告警', icon: Bell, route: { name: 'alerts' } },
  { key: 'settings', label: '设置', icon: Settings, route: { name: 'settings' } },
];

/**
 * 侧边栏。
 * 选中态用 layoutId 的滑动高亮块 —— 点击另一项时高亮块「滑过去」，
 * 而不是每一项各自硬切背景色。
 */
export function Sidebar() {
  const route = useApp((s) => s.route);
  const navigate = useApp((s) => s.navigate);
  const collapsed = useApp((s) => s.sidebarCollapsed);
  const toggle = useApp((s) => s.toggleSidebar);
  const servers = useApp((s) => s.servers);
  const unacked = useApp((s) => s.unackedCount);

  /** 详情页归属到「服务器」这一项上 */
  const activeKey = route.name === 'server' ? 'servers' : route.name;

  const onlineCount = servers.filter((s) => s.status === 'online').length;

  return (
    <motion.aside
      animate={{ width: collapsed ? 60 : 208 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="relative flex flex-col shrink-0 border-r select-none"
      style={{ background: '#ffffff', borderColor: 'rgba(16,24,40,0.06)' }}
    >
      {/* Logo */}
      <div className="drag-region h-[52px] flex items-center px-3 shrink-0">
        <div className="flex items-center gap-2.5 no-drag">
          <div
            className="w-7 h-7 rounded-[9px] flex items-center justify-center shrink-0 p-1"
            style={{
              background: 'linear-gradient(140deg, #0f9d70 0%, #0891a8 55%, #1e293b 100%)',
              boxShadow: '0 2px 10px -2px rgba(15,157,112,0.45)',
            }}
          >
            <CraneLogo size={18} />
          </div>
          <motion.div
            animate={{ opacity: collapsed ? 0 : 1, x: collapsed ? -6 : 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden whitespace-nowrap"
          >
            <div className="text-[13px] font-semibold text-[#12171f] leading-none tracking-tight flex items-center gap-1">
              <span>Tsuru</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#dc2f4b]" title="丹顶鹤" />
            </div>
            <div className="text-[9.5px] text-[#a8b0bd] mt-0.5 tracking-[0.12em] uppercase font-mono">
              Console
            </div>
          </motion.div>
        </div>
      </div>

      {/* 导航 */}
      <nav className="flex-1 px-2 pt-1 overflow-y-auto overflow-x-hidden">
        {NAV.map((item) => {
          const active = activeKey === item.key;
          const Icon = item.icon;
          const badge = item.key === 'alerts' ? unacked : 0;
          return (
            <button
              key={item.key}
              onClick={() => navigate(item.route)}
              className="relative w-full h-[34px] mb-0.5 flex items-center rounded-[9px] group"
              style={{ paddingLeft: collapsed ? 0 : 10, paddingRight: 8 }}
            >
              {active && (
                <motion.div
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-[9px]"
                  style={{
                    background: 'rgba(15,157,112,0.1)',
                    border: '1px solid rgba(15,157,112,0.18)',
                  }}
                  transition={{ type: 'spring', stiffness: 520, damping: 40, mass: 0.7 }}
                />
              )}
              <div
                className={`relative flex items-center flex-1 ${
                  collapsed ? 'justify-center' : 'gap-2.5'
                }`}
              >
                <Icon
                  size={15}
                  strokeWidth={active ? 2.1 : 1.8}
                  style={{
                    color: active ? '#0f9d70' : '#6b7484',
                    transition: 'color 180ms cubic-bezier(0.22,1,0.36,1)',
                  }}
                  className={active ? '' : 'group-hover:text-[#3d4655]'}
                />
                <motion.span
                  animate={{ opacity: collapsed ? 0 : 1 }}
                  transition={{ duration: 0.16 }}
                  className="text-[12.5px] whitespace-nowrap overflow-hidden"
                  style={{
                    color: active ? '#12171f' : '#5b6473',
                    fontWeight: active ? 550 : 450,
                  }}
                >
                  {item.label}
                </motion.span>
              </div>
              {badge > 0 && !collapsed && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                  className="relative ml-1 h-[16px] min-w-[16px] px-1 rounded-full flex items-center justify-center text-[9.5px] font-semibold shrink-0"
                  style={{ background: '#dc2f4b', color: '#fff' }}
                >
                  {badge > 99 ? '99+' : badge}
                </motion.span>
              )}
              {badge > 0 && collapsed && (
                <span
                  className="absolute top-1 right-1.5 w-[5px] h-[5px] rounded-full"
                  style={{ background: '#dc2f4b' }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* 底部：在线统计 + 折叠按钮 */}
      <div className="px-2 pb-2 shrink-0">
        <motion.div
          animate={{ opacity: collapsed ? 0 : 1, height: collapsed ? 0 : 'auto' }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          <div
            className="mx-1 mb-2 px-2.5 py-2 rounded-[9px]"
            style={{ background: 'rgba(16,24,40,0.03)', border: '1px solid rgba(16,24,40,0.045)' }}
          >
            <div className="flex items-center justify-between text-[10.5px]">
              <span className="text-[#8b94a3]">在线服务器</span>
              <span className="font-mono font-medium">
                <span style={{ color: '#0f9d70' }}>{onlineCount}</span>
                <span className="text-[#a8b0bd]"> / {servers.length}</span>
              </span>
            </div>
            <div className="mt-1.5 h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(16,24,40,0.06)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'linear-gradient(90deg, #0f9d70, #0891a8)' }}
                animate={{ width: `${servers.length ? (onlineCount / servers.length) * 100 : 0}%` }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        </motion.div>

        <button
          onClick={toggle}
          className={`w-full h-[30px] flex items-center rounded-[8px] text-[#8b94a3] hover:text-[#12171f] hover:bg-[rgba(16,24,40,0.05)] transition-all duration-150 ${
            collapsed ? 'justify-center' : 'px-2.5 gap-2'
          }`}
        >
          {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
          <motion.span
            animate={{ opacity: collapsed ? 0 : 1, width: collapsed ? 0 : 'auto' }}
            transition={{ duration: 0.16 }}
            className="text-[11.5px] overflow-hidden whitespace-nowrap"
          >
            收起侧栏
          </motion.span>
        </button>
      </div>
    </motion.aside>
  );
}
