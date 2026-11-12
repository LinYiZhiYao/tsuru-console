import type {
  ServerRecord,
  ServerStatus,
  CloudProvider,
  CloudInstance,
  MetricSample,
  AlertRule,
  AlertEvent,
  RemoteFileEntry,
  BatchExecResult,
  AuthMethod,
  ProcessInfo,
  SystemServiceInfo,
  DockerContainerInfo,
} from './index';

/** IPC 返回包 */
export type Res<T> = { ok: true; data: T } | { ok: false; error: string };

/** 云账号（脱敏后） */
export interface CloudAccountView {
  id: string;
  provider: CloudProvider;
  label: string;
  accessKeyId: string;
  accessKeySecret: string;
  defaultRegion?: string;
  regions?: string[];
  createdAt: number;
}

export interface AppInfo {
  userDataPath: string;
  serverCount: number;
  accountCount: number;
  secretCount: number;
  versions: { electron: string; node: string; chrome: string };
}

export interface ServerInput {
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  tags?: string[];
  note?: string;
  secret?: { password?: string; privateKey?: string; passphrase?: string };
}

export interface DraftProbeInput {
  host: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

export interface NebulaApi {
  servers: {
    list(): Promise<Res<ServerRecord[]>>;
    get(id: string): Promise<Res<ServerRecord | undefined>>;
    create(input: ServerInput): Promise<Res<ServerRecord>>;
    update(id: string, patch: Partial<ServerInput>): Promise<Res<ServerRecord>>;
    remove(id: string): Promise<Res<void>>;
    secretFlags(id: string): Promise<Res<{ hasPassword: boolean; hasPrivateKey: boolean; hasPassphrase: boolean }>>;
    probe(id: string): Promise<Res<{ latencyMs: number; os: string }>>;
    testDraft(draft: DraftProbeInput): Promise<Res<{ latencyMs: number }>>;
    processes(id: string): Promise<Res<ProcessInfo[]>>;
    killProcess(id: string, pid: number, signal?: string): Promise<Res<boolean>>;
    services(id: string): Promise<Res<{ available: boolean; services: SystemServiceInfo[] }>>;
    manageService(id: string, name: string, action: 'start' | 'stop' | 'restart' | 'logs'): Promise<Res<{ ok: boolean; message: string }>>;
    dockerContainers(id: string): Promise<Res<{ hasDocker: boolean; containers: DockerContainerInfo[] }>>;
    manageDocker(id: string, containerId: string, action: 'start' | 'stop' | 'restart' | 'logs'): Promise<Res<{ ok: boolean; message: string }>>;
    exec(id: string, command: string, timeoutMs?: number): Promise<Res<{ code: number | null; stdout: string; stderr: string; durationMs: number }>>;
  };
  terminal: {
    open(serverId: string, cols: number, rows: number): Promise<Res<{ sessionId: string }>>;
    write(sessionId: string, data: string): Promise<Res<void>>;
    resize(sessionId: string, cols: number, rows: number): Promise<Res<void>>;
    close(sessionId: string): Promise<Res<void>>;
    list(): Promise<Res<{ sessionId: string; serverId: string; createdAt: number }[]>>;
  };
  files: {
    home(serverId: string): Promise<Res<string>>;
    list(serverId: string, p: string): Promise<Res<RemoteFileEntry[]>>;
    remove(serverId: string, p: string, isDir: boolean): Promise<Res<void>>;
    mkdir(serverId: string, p: string): Promise<Res<void>>;
    read(serverId: string, p: string): Promise<Res<string>>;
    write(serverId: string, p: string, content: string): Promise<Res<void>>;
    upload(serverId: string, local: string, remote: string): Promise<Res<void>>;
    download(serverId: string, remote: string, local: string): Promise<Res<void>>;
  };
  batch: {
    exec(serverIds: string[], command: string): Promise<Res<BatchExecResult[]>>;
  };
  metrics: {
    get(serverId: string): Promise<Res<MetricSample[]>>;
    sampleNow(serverId: string): Promise<Res<MetricSample>>;
    rules(): Promise<Res<AlertRule[]>>;
    upsertRule(rule: AlertRule): Promise<Res<AlertRule>>;
    deleteRule(id: string): Promise<Res<void>>;
    events(): Promise<Res<AlertEvent[]>>;
    ackEvent(id: string): Promise<Res<void>>;
    clearEvents(): Promise<Res<void>>;
  };
  cloud: {
    accounts(): Promise<Res<CloudAccountView[]>>;
    addAccount(input: {
      id: string;
      provider: CloudProvider;
      label: string;
      accessKeyId: string;
      accessKeySecret: string;
      defaultRegion?: string;
      regions?: string[];
    }): Promise<Res<{ id: string }>>;
    deleteAccount(id: string): Promise<Res<void>>;
    verify(id: string): Promise<Res<string>>;
    listInstances(id: string): Promise<Res<CloudInstance[]>>;
    power(
      id: string,
      instanceId: string,
      region: string,
      action: 'start' | 'stop' | 'reboot' | 'terminate',
    ): Promise<Res<void>>;
    import(params: {
      provider: ServerRecord['origin'];
      instanceId: string;
      name: string;
      host: string;
      region: string;
      cloudAccountId: string;
      username: string;
      port: number;
      authMethod: AuthMethod;
      secret?: { password?: string; privateKey?: string; passphrase?: string };
    }): Promise<Res<ServerRecord>>;
  };
  app: {
    info(): Promise<Res<AppInfo>>;
    openPath(p: string): Promise<Res<string>>;
    showItemInFolder(p: string): Promise<Res<void>>;
  };
  on(channel: string, cb: (payload: any) => void): () => void;
}

declare global {
  interface Window {
    nebula: NebulaApi;
  }
}

export type { ServerRecord, ServerStatus };
