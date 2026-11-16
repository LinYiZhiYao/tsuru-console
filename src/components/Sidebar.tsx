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
      animate={{ width: collapsed ? 64 : 216 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="relative flex flex-col shrink-0 select-none"
      style={{ background: '#f0f4f9' }}
    >
      {/* Logo */}
      <div className="drag-region h-[54px] flex items-center px-3.5 shrink-0">
        <div className="flex items-center gap-2.5 no-drag">
          <div
            className="w-8 h-8 rounded-[11px] flex items-center justify-center shrink-0 p-1"
            style={{
              background: 'linear-gradient(135deg, #1b6ef3 0%, #0891a8 52%, #0f9d70 100%)',
              boxShadow: '0 2px 6px rgba(15,157,112,0.28)',
            }}
          >
            <CraneLogo size={19} />
          </div>
          <motion.div
            animate={{ opacity: collapsed ? 0 : 1, x: collapsed ? -6 : 0 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden whitespace-nowrap"
          >
            <div className="text-[13.5px] font-bold text-[#1f1f1f] leading-none tracking-tight flex items-center gap-1.5">
              <span>Tsuru</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white text-[#0f9d70] border border-[rgba(15,157,112,0.2)]">
                Pro
              </span>
            </div>
            <div className="text-[9.5px] text-[#747775] mt-1 tracking-[0.12em] uppercase font-mono">
              Cloud Console
            </div>
          </motion.div>
        </div>
      </div>

      {/* 导航 */}
      <nav className="flex-1 px-2.5 pt-1.5 overflow-y-auto overflow-x-hidden space-y-0.5">
        {NAV.map((item) => {
          const active = activeKey === item.key;
          const Icon = item.icon;
          const badge = item.key === 'alerts' ? unacked : 0;
          return (
            <button
              key={item.key}
              onClick={() => navigate(item.route)}
              className="relative w-full h-[38px] flex items-center rounded-full group transition-colors duration-150 hover:bg-[rgba(15,23,42,0.04)]"
              style={{ paddingLeft: collapsed ? 0 : 14, paddingRight: 10 }}
            >
              {active && (
                <motion.div
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: 'linear-gradient(90deg, rgba(27,110,243,0.12) 0%, rgba(15,157,112,0.14) 100%)',
                    border: '1px solid rgba(15,157,112,0.2)',
                  }}
                  transition={{ type: 'spring', stiffness: 520, damping: 40, mass: 0.7 }}
                />
              )}
              <div
                className={`relative flex items-center flex-1 ${
                  collapsed ? 'justify-center' : 'gap-3'
                }`}
              >
                <Icon
                  size={15}
                  strokeWidth={active ? 2.2 : 1.85}
                  style={{
                    color: active ? '#0f9d70' : '#5b6473',
                    transition: 'color 180ms cubic-bezier(0.22,1,0.36,1)',
                  }}
                  className={active ? '' : 'group-hover:text-[#1f1f1f]'}
                />
                <motion.span
                  animate={{ opacity: collapsed ? 0 : 1 }}
                  transition={{ duration: 0.16 }}
                  className="text-[12.5px] whitespace-nowrap overflow-hidden"
                  style={{
                    color: active ? '#0d1b2a' : '#444746',
                    fontWeight: active ? 600 : 480,
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
                  className="relative ml-1 h-[17px] min-w-[17px] px-1.5 rounded-full flex items-center justify-center text-[9.5px] font-semibold shrink-0"
                  style={{ background: '#dc2f4b', color: '#fff' }}
                >
                  {badge > 99 ? '99+' : badge}
                </motion.span>
              )}
              {badge > 0 && collapsed && (
                <span
                  className="absolute top-1.5 right-2 w-[6px] h-[6px] rounded-full"
                  style={{ background: '#dc2f4b' }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* 底部：在线统计 + 折叠按钮 */}
      <div className="px-2.5 pb-2.5 shrink-0">
        <motion.div
          animate={{ opacity: collapsed ? 0 : 1, height: collapsed ? 0 : 'auto' }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          <div
            className="mx-0.5 mb-2 px-3 py-2.5 rounded-2xl"
            style={{ background: '#ffffff', border: '1px solid rgba(15,23,42,0.06)', boxShadow: '0 2px 8px -2px rgba(15,23,42,0.04)' }}
          >
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#5b6473] font-medium">在线节点</span>
              <span className="font-mono font-semibold">
                <span style={{ color: '#0f9d70' }}>{onlineCount}</span>
                <span className="text-[#9aa0a6]"> / {servers.length}</span>
              </span>
            </div>
            <div className="mt-1.5 h-[4px] rounded-full overflow-hidden" style={{ background: '#e9eef6' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'linear-gradient(90deg, #1b6ef3, #0f9d70)' }}
                animate={{ width: `${servers.length ? (onlineCount / servers.length) * 100 : 0}%` }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        </motion.div>

        <button
          onClick={toggle}
          className={`w-full h-[32px] flex items-center rounded-full text-[#5b6473] hover:text-[#1f1f1f] hover:bg-[rgba(15,23,42,0.05)] transition-all duration-150 ${
            collapsed ? 'justify-center' : 'px-3 gap-2'
          }`}
        >
          {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
          <motion.span
            animate={{ opacity: collapsed ? 0 : 1, width: collapsed ? 0 : 'auto' }}
            transition={{ duration: 0.16 }}
            className="text-[11.5px] overflow-hidden whitespace-nowrap font-medium"
          >
            收起导航栏
          </motion.span>
        </button>
      </div>
    </motion.aside>
  );
}
