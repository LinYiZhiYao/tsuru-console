import { useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion, PresenceContext } from 'framer-motion';
import { Sidebar } from '@/components/Sidebar';
import { TitleBar } from '@/components/TitleBar';
import { Toasts } from '@/components/Toasts';
import { useApp } from '@/stores/app';
import { DashboardPage } from '@/pages/Dashboard';
import { ServersPage } from '@/pages/Servers';
import { ServerDetailPage } from '@/pages/ServerDetail';
import { TerminalPage } from '@/pages/Terminal';
import { CloudPage } from '@/pages/Cloud';
import { MonitorPage } from '@/pages/Monitor';
import { BatchPage } from '@/pages/Batch';
import { AlertsPage } from '@/pages/Alerts';
import { SettingsPage } from '@/pages/Settings';
import { AddServerDialog } from '@/components/AddServerDialog';
import { CommandPalette } from '@/components/CommandPalette';

/** 页面转场：淡入 + 轻微上浮，不做横向滑动（横向滑动在切换不同信息密度的页面时很晕） */
const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

const pageTransition = { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const };

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="absolute inset-0 overflow-hidden"
    >
      <PresenceContext.Provider value={null}>{children}</PresenceContext.Provider>
    </motion.div>
  );
}

export default function App() {
  const route = useApp((s) => s.route);
  const terminalTabs = useApp((s) => s.terminalTabs);
  const loadServers = useApp((s) => s.loadServers);
  const loadAccounts = useApp((s) => s.loadAccounts);
  const loadAlerts = useApp((s) => s.loadAlerts);
  const toast = useApp((s) => s.toast);
  const updateServerStatus = useApp((s) => s.updateServerStatus);
  const pushAlert = useApp((s) => s.pushAlert);

  const [addOpen, setAddOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [booted, setBooted] = useState(false);

  /* 全局快捷键：Ctrl+K 或 Cmd+K 呼出指令面板 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* 首次加载：并行拉取三类数据 */
  useEffect(() => {
    (async () => {
      await Promise.all([loadServers(), loadAccounts(), loadAlerts()]);
      setBooted(true);
    })();
  }, [loadServers, loadAccounts, loadAlerts]);

  /* 订阅主进程推送 */
  useEffect(() => {
    const offStatus = window.nebula.on('server:status', (p: any) => {
      updateServerStatus(p.serverId, p.status, p.latencyMs);
    });
    const offAlert = window.nebula.on('alert:new', (p: any) => {
      pushAlert(p);
      toast({ type: 'warn', title: '触发告警', desc: p.message });
    });
    const offSync = window.nebula.on('sync:progress', (p: any) => {
      useApp.getState().setSyncProgress(p.done ? null : p.message);
    });
    return () => {
      offStatus();
      offAlert();
      offSync();
    };
  }, [updateServerStatus, pushAlert, toast]);

  const handleRefresh = useCallback(() => {
    void loadServers();
    void loadAccounts();
    void loadAlerts();
    toast({ type: 'info', title: '已刷新' });
  }, [loadServers, loadAccounts, loadAlerts, toast]);

  const renderPage = () => {
    switch (route.name) {
      case 'dashboard':
        return <DashboardPage key="dash" />;
      case 'servers':
        return <ServersPage key="servers" onAdd={() => setAddOpen(true)} />;
      case 'server':
        return <ServerDetailPage key={`detail-${route.id}`} serverId={route.id} />;
      case 'terminal':
        return <TerminalPage key="terminal" />;
      case 'cloud':
        return <CloudPage key="cloud" />;
      case 'monitor':
        return <MonitorPage key="monitor" />;
      case 'batch':
        return <BatchPage key="batch" />;
      case 'alerts':
        return <AlertsPage key="alerts" />;
      case 'settings':
        return <SettingsPage key="settings" />;
      default:
        return <DashboardPage key="dash" />;
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#f4f6f8' }}>
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <TitleBar
            onAddServer={() => setAddOpen(true)}
            onRefresh={handleRefresh}
            onOpenPalette={() => setPaletteOpen(true)}
          />
          <main className="relative flex-1 overflow-hidden">
            {booted ? (
              <>
                <AnimatePresence mode="wait">
                  {route.name !== 'terminal' && (
                    <PageShell key={JSON.stringify(route)}>{renderPage()}</PageShell>
                  )}
                </AnimatePresence>
                {(route.name === 'terminal' || terminalTabs.length > 0) && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={
                      route.name === 'terminal'
                        ? { opacity: 1, y: 0 }
                        : { opacity: 0, y: -6 }
                    }
                    transition={pageTransition}
                    className="absolute inset-0 overflow-hidden"
                    style={{
                      pointerEvents: route.name === 'terminal' ? 'auto' : 'none',
                      zIndex: route.name === 'terminal' ? 10 : -1,
                    }}
                  >
                    <TerminalPage pageActive={route.name === 'terminal'} />
                  </motion.div>
                )}
              </>
            ) : (
              <BootScreen />
            )}
          </main>
        </div>
      </div>

      <AddServerDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onAddServer={() => setAddOpen(true)}
        onRefresh={handleRefresh}
      />
      <Toasts />
    </div>
  );
}

/** 启动画面：避免加载期间白屏 */
function BootScreen() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="w-11 h-11 rounded-[13px] flex items-center justify-center"
        style={{
          background: 'linear-gradient(140deg, #0f9d70 0%, #0891a8 100%)',
          boxShadow: '0 0 32px -6px rgba(15,157,112,0.48)',
        }}
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="w-4 h-4 rounded-full border-2 border-[#ffffff]/30 border-t-[#ffffff]"
        />
      </motion.div>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.3 }}
        className="text-[11.5px] text-[#a8b0bd]"
      >
        正在载入数据…
      </motion.p>
    </div>
  );
}
