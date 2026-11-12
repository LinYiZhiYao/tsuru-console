/**
 * Electron 主进程侧的共享类型（与 src/types 保持同步的精简副本）。
 * 主进程独立编译，避免跨 tsconfig 引用导致的路径问题。
 */

export type AuthMethod = 'password' | 'privateKey' | 'agent';
export type ServerOrigin = 'manual' | 'aws' | 'aliyun' | 'tencent' | 'azure';
export type ServerStatus = 'online' | 'offline' | 'unknown' | 'connecting' | 'error';
export type CloudProvider = 'aws' | 'aliyun';

export interface ServerRecord {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  origin: ServerOrigin;
  instanceId?: string;
  region?: string;
  cloudAccountId?: string;
  tags: string[];
  note?: string;
  status: ServerStatus;
  lastSeenAt?: number;
  latencyMs?: number;
  os?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ServerSecret {
  serverId: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

export interface CloudCredentials {
  id: string;
  provider: CloudProvider;
  label: string;
  accessKeyId: string;
  accessKeySecret: string;
  defaultRegion?: string;
  regions?: string[];
  createdAt: number;
}

export interface CloudInstance {
  instanceId: string;
  name: string;
  provider: CloudProvider;
  region: string;
  publicIp?: string;
  privateIp?: string;
  state: string;
  instanceType: string;
  vcpus?: number;
  memoryMb?: number;
  imageId?: string;
  launchTime?: string;
  managed?: boolean;
}

export interface MetricSample {
  t: number;
  cpu?: number;
  memUsed?: number;
  memTotal?: number;
  diskUsed?: number;
  diskTotal?: number;
  netRx?: number;
  netTx?: number;
  load1?: number;
  uptimeSec?: number;
  processes?: number;
}

export interface AlertRule {
  id: string;
  name: string;
  serverId: string;
  metric: 'cpu' | 'mem' | 'disk' | 'offline';
  threshold: number;
  consecutive: number;
  enabled: boolean;
  createdAt: number;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  serverId: string;
  serverName: string;
  metric: string;
  value: number;
  threshold: number;
  message: string;
  at: number;
  acknowledged: boolean;
}

export interface RemoteFileEntry {
  name: string;
  path: string;
  size: number;
  isDir: boolean;
  isSymlink: boolean;
  mode: string;
  mtime: number;
  owner?: string;
  group?: string;
}

export interface BatchExecResult {
  serverId: string;
  serverName: string;
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export type AppEventMap = {
  'server:status': { serverId: string; status: ServerStatus; latencyMs?: number };
  'terminal:data': { sessionId: string; data: string };
  'terminal:exit': { sessionId: string; code: number | null; message?: string };
  'alert:new': AlertEvent;
  'sync:progress': { provider: CloudProvider; message: string; done: boolean };
};

export interface ProcessInfo {
  pid: number;
  user: string;
  cpu: number;
  mem: number;
  comm: string;
  args: string;
}

export interface SystemServiceInfo {
  name: string;
  load: string;
  active: string;
  sub: string;
  description: string;
}

export interface DockerContainerInfo {
  id: string;
  names: string;
  image: string;
  status: string;
  state: string;
  ports: string;
}
