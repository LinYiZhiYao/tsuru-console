/**
 * 前后端共享类型定义
 * Electron 主进程与渲染进程都引用这一份，保证 IPC 通道契约一致。
 */

/** 凭据的认证方式 */
export type AuthMethod = 'password' | 'privateKey' | 'agent';

/** 服务器来源：手动录入 / 从云平台同步 */
export type ServerOrigin = 'manual' | 'aws' | 'aliyun' | 'tencent' | 'azure';

/** 服务器在线状态 */
export type ServerStatus = 'online' | 'offline' | 'unknown' | 'connecting' | 'error';

/** 云厂商 */
export type CloudProvider = 'aws' | 'aliyun';

/** 一台被纳管的服务器 */
export interface ServerRecord {
  id: string;
  name: string;
  /** 主机地址，IP 或域名 */
  host: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  origin: ServerOrigin;
  /** 云平台实例 ID，手动录入时为空 */
  instanceId?: string;
  /** 云平台区域 */
  region?: string;
  /** 归属的云账号配置 id */
  cloudAccountId?: string;
  /** 分组标签 */
  tags: string[];
  /** 备注 */
  note?: string;
  status: ServerStatus;
  /** 最近一次连通性探测时间（epoch ms） */
  lastSeenAt?: number;
  /** 最近一次探测的耗时 ms */
  latencyMs?: number;
  /** 系统信息，登录后采集 */
  os?: string;
  createdAt: number;
  updatedAt: number;
}

/** 凭据单独存储，便于脱敏展示与单独加密 */
export interface ServerSecret {
  serverId: string;
  /** 密码（password 方式） */
  password?: string;
  /** 私钥内容 PEM（privateKey 方式） */
  privateKey?: string;
  /** 私钥口令 */
  passphrase?: string;
}

/** 云账号配置的凭据 */
export interface CloudCredentials {
  id: string;
  provider: CloudProvider;
  label: string;
  /** AWS: AccessKeyId / 阿里云: AccessKeyId */
  accessKeyId: string;
  /** AWS: SecretAccessKey / 阿里云: AccessKeySecret */
  accessKeySecret: string;
  /** AWS API 调用可选的默认区域 */
  defaultRegion?: string;
  /** 阿里云地域，如 cn-hangzhou */
  regions?: string[];
  createdAt: number;
}

/** 云平台上的一个实例 */
export interface CloudInstance {
  instanceId: string;
  name: string;
  provider: CloudProvider;
  region: string;
  /** 公网 IP */
  publicIp?: string;
  privateIp?: string;
  state: string;
  instanceType: string;
  /** vCPU 数 */
  vcpus?: number;
  /** 内存 MB */
  memoryMb?: number;
  imageId?: string;
  launchTime?: string;
  /** 是否已被纳管（存在同 instanceId 的 ServerRecord） */
  managed?: boolean;
}

/** 单点监控采样 */
export interface MetricSample {
  /** epoch ms */
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

/** SSH 会话句柄信息 */
export interface SshSessionInfo {
  sessionId: string;
  serverId: string;
  cols: number;
  rows: number;
}

/** SSH 终端事件 */
export interface TerminalDataEvent {
  sessionId: string;
  data: string;
}

/** 远端文件条目 */
export interface RemoteFileEntry {
  name: string;
  path: string;
  /** 字节 */
  size: number;
  isDir: boolean;
  isSymlink: boolean;
  /** 权限字符串，如 -rw-r--r-- */
  mode: string;
  /** epoch ms */
  mtime: number;
  owner?: string;
  group?: string;
}

/** 批量命令执行结果 */
export interface BatchExecResult {
  serverId: string;
  serverName: string;
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/** 告警规则 */
export interface AlertRule {
  id: string;
  name: string;
  serverId: string;
  metric: 'cpu' | 'mem' | 'disk' | 'offline';
  /** 阈值百分比 0-100 */
  threshold: number;
  /** 连续触发几次才告警 */
  consecutive: number;
  enabled: boolean;
  createdAt: number;
}

/** 一条告警记录 */
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

/** 统一 IPC 返回包 */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** 主进程向前端推送的事件通道 payload */
export interface AppEventMap {
  'server:status': { serverId: string; status: ServerStatus; latencyMs?: number };
  'terminal:data': TerminalDataEvent;
  'terminal:exit': { sessionId: string; code: number | null; message?: string };
  'alert:new': AlertEvent;
  'sync:progress': { provider: CloudProvider; message: string; done: boolean };
}

/** 远程系统进程信息 */
export interface ProcessInfo {
  pid: number;
  user: string;
  cpu: number;
  mem: number;
  comm: string;
  args: string;
}

/** 系统服务 */
export interface SystemServiceInfo {
  name: string;
  load: string;
  active: string;
  sub: string;
  description: string;
}

/** Docker 容器 */
export interface DockerContainerInfo {
  id: string;
  names: string;
  image: string;
  status: string;
  state: string;
  ports: string;
}
