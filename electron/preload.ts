import { contextBridge, ipcRenderer } from 'electron';

/**
 * 预加载脚本：向渲染进程暴露白名单 API。
 * contextIsolation 开启，渲染进程拿不到 Node 能力，所有能力都必须走这里。
 */

const invoke = <T>(channel: string, ...args: any[]): Promise<{ ok: true; data: T } | { ok: false; error: string }> =>
  ipcRenderer.invoke(channel, ...args);

const api = {
  servers: {
    list: () => invoke('servers:list'),
    get: (id: string) => invoke('servers:get', id),
    create: (input: any) => invoke('servers:create', input),
    update: (id: string, patch: any) => invoke('servers:update', id, patch),
    remove: (id: string) => invoke('servers:delete', id),
    secretFlags: (id: string) => invoke('servers:secretFlags', id),
    probe: (id: string) => invoke('servers:probe', id),
    testDraft: (draft: any) => invoke('servers:testDraft', draft),
    processes: (id: string) => invoke('servers:processes', id),
    killProcess: (id: string, pid: number, signal?: string) =>
      invoke('servers:killProcess', id, pid, signal),
    services: (id: string) => invoke('servers:services', id),
    manageService: (id: string, name: string, action: string) =>
      invoke('servers:manageService', id, name, action),
    dockerContainers: (id: string) => invoke('servers:dockerContainers', id),
    manageDocker: (id: string, containerId: string, action: string) =>
      invoke('servers:manageDocker', id, containerId, action),
    exec: (id: string, command: string, timeoutMs?: number) =>
      invoke('servers:exec', id, command, timeoutMs),
  },
  terminal: {
    open: (serverId: string, cols: number, rows: number) =>
      invoke('terminal:open', serverId, cols, rows),
    write: (sessionId: string, data: string) => invoke('terminal:write', sessionId, data),
    resize: (sessionId: string, cols: number, rows: number) =>
      invoke('terminal:resize', sessionId, cols, rows),
    close: (sessionId: string) => invoke('terminal:close', sessionId),
    list: () => invoke('terminal:list'),
  },
  files: {
    home: (serverId: string) => invoke('files:home', serverId),
    list: (serverId: string, p: string) => invoke('files:list', serverId, p),
    remove: (serverId: string, p: string, isDir: boolean) =>
      invoke('files:delete', serverId, p, isDir),
    mkdir: (serverId: string, p: string) => invoke('files:mkdir', serverId, p),
    read: (serverId: string, p: string) => invoke('files:read', serverId, p),
    write: (serverId: string, p: string, content: string) =>
      invoke('files:write', serverId, p, content),
    upload: (serverId: string, local: string, remote: string) =>
      invoke('files:upload', serverId, local, remote),
    download: (serverId: string, remote: string, local: string) =>
      invoke('files:download', serverId, remote, local),
  },
  batch: {
    exec: (serverIds: string[], command: string) => invoke('batch:exec', serverIds, command),
  },
  metrics: {
    get: (serverId: string) => invoke('metrics:get', serverId),
    sampleNow: (serverId: string) => invoke('metrics:sampleNow', serverId),
    rules: () => invoke('metrics:rules'),
    upsertRule: (rule: any) => invoke('metrics:upsertRule', rule),
    deleteRule: (id: string) => invoke('metrics:deleteRule', id),
    events: () => invoke('metrics:events'),
    ackEvent: (id: string) => invoke('metrics:ackEvent', id),
    clearEvents: () => invoke('metrics:clearEvents'),
  },
  cloud: {
    accounts: () => invoke('cloud:accounts'),
    addAccount: (input: any) => invoke('cloud:addAccount', input),
    deleteAccount: (id: string) => invoke('cloud:deleteAccount', id),
    verify: (id: string) => invoke('cloud:verify', id),
    listInstances: (id: string) => invoke('cloud:listInstances', id),
    power: (id: string, instanceId: string, region: string, action: string) =>
      invoke('cloud:power', id, instanceId, region, action),
    import: (params: any) => invoke('cloud:import', params),
  },
  app: {
    info: () => invoke('app:info'),
    openPath: (p: string) => invoke('app:openPath', p),
    showItemInFolder: (p: string) => invoke('app:showItemInFolder', p),
  },
  /** 订阅主进程推送；返回取消订阅函数 */
  on(channel: string, cb: (payload: any) => void) {
    const listener = (_e: any, payload: any) => cb(payload);
    ipcRenderer.on(`evt:${channel}`, listener);
    return () => ipcRenderer.removeListener(`evt:${channel}`, listener);
  },
};

contextBridge.exposeInMainWorld('nebula', api);

export type NebulaApi = typeof api;
