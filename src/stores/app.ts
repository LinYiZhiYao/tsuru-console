import { create } from 'zustand';
import type { ServerRecord, AlertEvent, ServerStatus, CloudInstance } from '@/types';
import type { CloudAccountView } from '@/types/bridge';
import { unwrap, cleanError } from '@/lib/utils';

/** 页面路由 */
export type Route =
  | { name: 'dashboard' }
  | { name: 'servers' }
  | { name: 'server'; id: string }
  | { name: 'terminal' }
  | { name: 'cloud' }
  | { name: 'monitor' }
  | { name: 'batch' }
  | { name: 'alerts' }
  | { name: 'settings' };

/** Toast 通知 */
export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warn';
  title: string;
  desc?: string;
  /** 创建时间，用于自动消失 */
  at: number;
}

/** 终端会话标签（提升到全局 store，切页面不销毁会话） */
export interface OpenTerminalTab {
  key: string;
  serverId: string;
  serverName: string;
  status: string;
  attempt: number;
}

interface AppState {
  /* ---- 路由 ---- */
  route: Route;
  navigate: (r: Route) => void;

  /* ---- 服务器 ---- */
  servers: ServerRecord[];
  serversLoading: boolean;
  loadServers: () => Promise<void>;
  updateServerStatus: (serverId: string, status: ServerStatus, latencyMs?: number) => void;

  /* ---- 终端标签 ---- */
  terminalTabs: OpenTerminalTab[];
  activeTerminalKey: string | null;
  openTerminalTab: (serverId: string, navigateToPage?: boolean) => void;
  closeTerminalTab: (key: string) => void;
  setActiveTerminalKey: (key: string | null) => void;
  retryTerminalTab: (key: string) => void;

  /* ---- 云账号 ---- */
  accounts: CloudAccountView[];
  accountsLoading: boolean;
  loadAccounts: () => Promise<void>;

  /* ---- 云实例缓存 ---- */
  instances: Record<string, CloudInstance[]>;
  instancesLoading: string | null;
  syncProgress: string | null;
  loadInstances: (accountId: string) => Promise<void>;
  setSyncProgress: (msg: string | null) => void;

  /* ---- 告警 ---- */
  alerts: AlertEvent[];
  unackedCount: number;
  loadAlerts: () => Promise<void>;
  pushAlert: (e: AlertEvent) => void;
  ackAlert: (id: string) => Promise<void>;
  clearAlerts: () => Promise<void>;

  /* ---- Toast ---- */
  toasts: Toast[];
  toast: (t: Omit<Toast, 'id' | 'at'>) => void;
  dismissToast: (id: string) => void;

  /* ---- 侧栏折叠 ---- */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

let toastSeq = 0;
let termTabSeq = 0;

export const useApp = create<AppState>((set, get) => ({
  /* ---------------- 路由 ---------------- */
  route: { name: 'dashboard' },
  navigate: (r) => set({ route: r }),

  /* ---------------- 服务器 ---------------- */
  servers: [],
  serversLoading: false,
  loadServers: async () => {
    set({ serversLoading: true });
    try {
      const list = await unwrap(window.nebula.servers.list());
      const byId = new Map(list.map((s) => [s.id, s]));
      set((state) => {
        const nextTabs = state.terminalTabs
          .filter((t) => byId.has(t.serverId))
          .map((t) => {
            const srv = byId.get(t.serverId)!;
            return { ...t, serverName: srv.name, status: srv.status };
          });
        const activeStillExists = nextTabs.some((t) => t.key === state.activeTerminalKey);
        return {
          servers: list,
          serversLoading: false,
          terminalTabs: nextTabs,
          activeTerminalKey: activeStillExists
            ? state.activeTerminalKey
            : nextTabs.length
              ? nextTabs[nextTabs.length - 1].key
              : null,
        };
      });
    } catch (e) {
      set({ serversLoading: false });
      get().toast({ type: 'error', title: '加载服务器列表失败', desc: cleanError(e) });
    }
  },
  updateServerStatus: (serverId, status, latencyMs) =>
    set((s) => ({
      servers: s.servers.map((x) =>
        x.id === serverId
          ? {
              ...x,
              status,
              latencyMs: status === 'offline' ? undefined : latencyMs ?? x.latencyMs,
            }
          : x,
      ),
      terminalTabs: s.terminalTabs.map((t) =>
        t.serverId === serverId ? { ...t, status } : t,
      ),
    })),

  /* ---------------- 终端标签 ---------------- */
  terminalTabs: [],
  activeTerminalKey: null,
  openTerminalTab: (serverId, navigateToPage = true) => {
    const server = get().servers.find((s) => s.id === serverId);
    if (!server) return;
    const key = `${serverId}-${Date.now()}-${++termTabSeq}`;
    set((s) => ({
      terminalTabs: [
        ...s.terminalTabs,
        { key, serverId, serverName: server.name, status: server.status, attempt: 0 },
      ],
      activeTerminalKey: key,
      ...(navigateToPage ? { route: { name: 'terminal' as const } } : {}),
    }));
  },
  closeTerminalTab: (key) =>
    set((s) => {
      const next = s.terminalTabs.filter((x) => x.key !== key);
      const nextActive =
        s.activeTerminalKey === key
          ? next.length
            ? next[next.length - 1].key
            : null
          : s.activeTerminalKey;
      return { terminalTabs: next, activeTerminalKey: nextActive };
    }),
  setActiveTerminalKey: (key) => set({ activeTerminalKey: key }),
  retryTerminalTab: (key) =>
    set((s) => ({
      terminalTabs: s.terminalTabs.map((t) =>
        t.key === key ? { ...t, attempt: t.attempt + 1 } : t,
      ),
    })),

  /* ---------------- 云账号 ---------------- */
  accounts: [],
  accountsLoading: false,
  loadAccounts: async () => {
    set({ accountsLoading: true });
    try {
      const list = await unwrap(window.nebula.cloud.accounts());
      const validIds = new Set(list.map((a) => a.id));
      set((s) => {
        const nextInstances: Record<string, CloudInstance[]> = {};
        for (const [k, v] of Object.entries(s.instances)) {
          if (validIds.has(k)) nextInstances[k] = v;
        }
        return { accounts: list, accountsLoading: false, instances: nextInstances };
      });
    } catch (e) {
      set({ accountsLoading: false });
      get().toast({ type: 'error', title: '加载云账号失败', desc: cleanError(e) });
    }
  },

  /* ---------------- 云实例 ---------------- */
  instances: {},
  instancesLoading: null,
  syncProgress: null,
  setSyncProgress: (msg) => set({ syncProgress: msg }),
  loadInstances: async (accountId) => {
    set({ instancesLoading: accountId, syncProgress: null });
    try {
      const list = await unwrap(window.nebula.cloud.listInstances(accountId));
      set((s) => ({
        instances: { ...s.instances, [accountId]: list },
        instancesLoading: null,
        syncProgress: null,
      }));
    } catch (e) {
      set({ instancesLoading: null, syncProgress: null });
      get().toast({ type: 'error', title: '拉取云实例失败', desc: cleanError(e) });
    }
  },

  /* ---------------- 告警 ---------------- */
  alerts: [],
  unackedCount: 0,
  loadAlerts: async () => {
    try {
      const list = await unwrap(window.nebula.metrics.events());
      set({ alerts: list, unackedCount: list.filter((a) => !a.acknowledged).length });
    } catch {
      /* 告警加载失败不打扰用户 */
    }
  },
  pushAlert: (e) =>
    set((s) => ({
      alerts: [e, ...s.alerts].slice(0, 200),
      unackedCount: s.unackedCount + (e.acknowledged ? 0 : 1),
    })),
  ackAlert: async (id) => {
    await window.nebula.metrics.ackEvent(id);
    set((s) => {
      const alerts = s.alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a));
      return { alerts, unackedCount: alerts.filter((a) => !a.acknowledged).length };
    });
  },
  clearAlerts: async () => {
    await window.nebula.metrics.clearEvents();
    set({ alerts: [], unackedCount: 0 });
  },

  /* ---------------- Toast ---------------- */
  toasts: [],
  toast: (t) => {
    const id = `t${++toastSeq}`;
    const item: Toast = { ...t, id, at: Date.now() };
    set((s) => ({ toasts: [...s.toasts, item] }));
    // 错误提示停留久一点，让用户看清
    const ttl = t.type === 'error' ? 6000 : 3200;
    setTimeout(() => get().dismissToast(id), ttl);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  /* ---------------- 侧栏 ---------------- */
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
