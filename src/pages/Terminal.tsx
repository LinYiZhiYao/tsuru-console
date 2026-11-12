import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, TerminalSquare } from 'lucide-react';
import { useApp } from '@/stores/app';
import { TerminalTab } from '@/components/TerminalTab';
import { StatusDot, EmptyState } from '@/components/Primitives';

export function TerminalPage({ pageActive = true }: { pageActive?: boolean }) {
  const servers = useApp((s) => s.servers);
  const tabs = useApp((s) => s.terminalTabs);
  const activeKey = useApp((s) => s.activeTerminalKey);
  const openTerminalTab = useApp((s) => s.openTerminalTab);
  const closeTab = useApp((s) => s.closeTerminalTab);
  const setActiveKey = useApp((s) => s.setActiveTerminalKey);
  const [pickerOpen, setPickerOpen] = useState(false);

  const openTab = (serverId: string) => {
    openTerminalTab(serverId, false);
    setPickerOpen(false);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 标签栏 */}
      <div
        className="flex items-center h-[40px] shrink-0 border-b overflow-x-auto"
        style={{ borderColor: 'rgba(16,24,40,0.06)', background: '#ffffff' }}
      >
        <div className="flex items-center h-full px-1.5 gap-0.5">
          <AnimatePresence initial={false}>
            {tabs.map((tab) => {
              const active = tab.key === activeKey;
              return (
                <motion.div
                  key={tab.key}
                  layout
                  initial={{ opacity: 0, y: -8, width: 0 }}
                  animate={{ opacity: 1, y: 0, width: 'auto' }}
                  exit={{ opacity: 0, y: -6, width: 0, transition: { duration: 0.16 } }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  className="relative flex items-center shrink-0"
                >
                  <button
                    onClick={() => setActiveKey(tab.key)}
                    className="relative h-[28px] px-2.5 flex items-center gap-1.5 rounded-[7px] overflow-hidden"
                    style={{ color: active ? '#12171f' : '#6b7484', transition: 'color 160ms' }}
                  >
                    {active && (
                      <motion.div
                        layoutId="term-tab-active"
                        className="absolute inset-0 rounded-[7px]"
                        style={{ background: 'rgba(16,24,40,0.06)', border: '1px solid rgba(16,24,40,0.06)' }}
                        transition={{ type: 'spring', stiffness: 540, damping: 40 }}
                      />
                    )}
                    <StatusDot status={tab.status} size={5} />
                    <span className="relative text-[11.5px] whitespace-nowrap max-w-[130px] truncate font-mono">
                      {tab.serverName}
                    </span>
                    <span
                      className="relative ml-0.5 p-0.5 rounded hover:bg-[rgba(16,24,40,0.09)] transition-colors duration-150"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tab.key);
                      }}
                    >
                      <X size={10} />
                    </span>
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        <button
          onClick={() => setPickerOpen((v) => !v)}
          className="ml-1 w-[26px] h-[26px] shrink-0 rounded-[7px] flex items-center justify-center text-[#8b94a3] hover:text-[#0f9d70] hover:bg-[rgba(16,24,40,0.06)] transition-all duration-150"
          title="新建会话"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* 主机选择器 */}
      <AnimatePresence>
        {pickerOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden shrink-0 border-b"
            style={{ borderColor: 'rgba(16,24,40,0.06)', background: '#fafbfc' }}
          >
            <div className="px-4 py-2.5">
              <p className="text-[10.5px] text-[#8b94a3] mb-2">选择要连接的服务器</p>
              {servers.length === 0 ? (
                <p className="text-[11.5px] text-[#a8b0bd] py-2">还没有服务器，请先添加。</p>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-1.5">
                  {servers.map((s, i) => (
                    <motion.button
                      key={s.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02, duration: 0.2 }}
                      onClick={() => openTab(s.id)}
                      className="flex items-center gap-2 px-2.5 h-[32px] rounded-[7px] text-left transition-colors duration-150"
                      style={{ background: 'rgba(16,24,40,0.03)', border: '1px solid rgba(16,24,40,0.045)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(15,157,112,0.1)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(16,24,40,0.03)')}
                    >
                      <StatusDot status={s.status} size={5} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11.5px] text-[#12171f] truncate">{s.name}</div>
                        <div className="text-[9.5px] text-[#a8b0bd] font-mono truncate">{s.host}</div>
                      </div>
                      <TerminalSquare size={11} className="text-[#a8b0bd] shrink-0" />
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 终端区域 */}
      <div className="relative flex-1 min-h-0">
        {tabs.length === 0 ? (
          <div className="h-full grid place-items-center">
            <EmptyState
              icon={<TerminalSquare size={22} color="#a8b0bd" />}
              title="没有打开的终端"
              desc="点击上方 + 选择一个服务器，即可在这里打开 SSH 会话。支持多标签、多机器并行操作。"
              action={
                <button className="btn btn-primary" onClick={() => setPickerOpen(true)}>
                  <Plus size={13} />
                  新建会话
                </button>
              }
            />
          </div>
        ) : (
          tabs.map((tab) => (
            <TerminalTab
              key={tab.key}
              serverId={tab.serverId}
              serverName={tab.serverName}
              status={tab.status}
              active={pageActive && tab.key === activeKey}
              onClose={() => closeTab(tab.key)}
            />
          ))
        )}
      </div>
    </div>
  );
}
