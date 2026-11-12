import { Client, type ConnectConfig, type ClientChannel } from 'ssh2';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { db, vault } from '../db';
import type { ServerRecord, ServerSecret, RemoteFileEntry, MetricSample, ProcessInfo, SystemServiceInfo, DockerContainerInfo } from '../types';

/** 一个活跃的交互式终端会话 */
export interface ActiveSession {
  id: string;
  serverId: string;
  client: Client;
  shell: ClientChannel;
  createdAt: number;
}

const sessions = new Map<string, ActiveSession>();

/** 把 ServerSecret 转成 ssh2 的 ConnectConfig 片段 */
async function buildAuthConfig(server: ServerRecord, secret: ServerSecret): Promise<Partial<ConnectConfig>> {
  if (server.authMethod === 'privateKey') {
    if (!secret.privateKey) throw new Error('缺少私钥内容');
    return { privateKey: secret.privateKey, passphrase: secret.passphrase };
  }
  if (server.authMethod === 'agent') {
    // Windows OpenSSH 会设置 SSH_AUTH_SOCK；未设置时尝试命名管道默认路径
    const sock = process.env.SSH_AUTH_SOCK || '\\\\.\\pipe\\openssh-ssh-agent';
    return { agent: sock };
  }
  if (!secret.password) throw new Error('缺少登录密码');
  return { password: secret.password };
}

async function getSecret(
  server: ServerRecord,
  overrideSecret?: Partial<ServerSecret>,
): Promise<ServerSecret> {
  if (overrideSecret) {
    return { serverId: server.id, ...overrideSecret };
  }
  const data = await vault.read();
  const found = data.serverSecrets.find((s) => s.serverId === server.id);
  if (found) return found;
  if (server.authMethod === 'agent') return { serverId: server.id };
  throw new Error('未找到该服务器的凭据，请重新编辑服务器信息');
}

function baseConfig(server: ServerRecord): ConnectConfig {
  return {
    host: server.host,
    port: server.port,
    username: server.username,
    readyTimeout: 15000,
    keepaliveInterval: 15000,
    keepaliveCountMax: 4,
    // 大部分自建机器用不到，显式声明以免算法协商失败
    algorithms: undefined,
  } as ConnectConfig;
}

/** 建立一次性连接（用于探测、执行命令、读文件），用完即断 */
export async function connectTransient(
  server: ServerRecord,
  overrideSecret?: Partial<ServerSecret>,
): Promise<Client> {
  const secret = await getSecret(server, overrideSecret);
  const auth = await buildAuthConfig(server, secret);

  return new Promise((resolve, reject) => {
    const client = new Client();
    const timer = setTimeout(() => {
      client.end();
      reject(new Error('连接超时（15s）'));
    }, 16000);

    client.once('ready', () => {
      clearTimeout(timer);
      resolve(client);
    });
    client.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    try {
      client.connect({ ...baseConfig(server), ...auth });
    } catch (e) {
      clearTimeout(timer);
      reject(e);
    }
  });
}

/** 执行一条命令并收集输出 */
export async function execOn(server: ServerRecord, command: string, timeoutMs = 20000) {
  const started = Date.now();
  const client = await connectTransient(server);

  return new Promise<{ code: number | null; stdout: string; stderr: string; durationMs: number }>(
    (resolve, reject) => {
      const killer = setTimeout(() => {
        client.end();
        reject(new Error(`命令执行超时（${timeoutMs}ms）`));
      }, timeoutMs);

      client.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(killer);
          client.end();
          return reject(err);
        }
        let stdout = '';
        let stderr = '';
        stream.setEncoding('utf8');
        stream.stderr.setEncoding('utf8');
        stream.on('data', (chunk: string) => {
          stdout += chunk;
        });
        stream.stderr.on('data', (chunk: string) => {
          stderr += chunk;
        });
        stream.on('close', (code: number | null) => {
          clearTimeout(killer);
          client.end();
          resolve({ code, stdout, stderr, durationMs: Date.now() - started });
        });
      });
    },
  );
}

/** 连通性探测：只看能否握手 + 延迟 */
export async function probeServer(server: ServerRecord) {
  const started = Date.now();
  const client = await connectTransient(server);
  const latencyMs = Date.now() - started;
  client.end();
  return { latencyMs };
}

/* ------------------------------------------------------------------ */
/*  交互式终端会话                                                     */
/* ------------------------------------------------------------------ */

export interface SessionEvents {
  data: (sessionId: string, data: string) => void;
  exit: (sessionId: string, code: number | null, message?: string) => void;
}

export async function openSession(
  server: ServerRecord,
  cols: number,
  rows: number,
  ev: SessionEvents,
): Promise<string> {
  const secret = await getSecret(server);
  const auth = await buildAuthConfig(server, secret);
  const sessionId = randomUUID();
  const client = new Client();

  return new Promise((resolve, reject) => {
    let settled = false;
    const connTimer = setTimeout(() => {
      client.end();
      fail('连接超时（15s）');
    }, 16000);

    const fail = (msg: string) => {
      clearTimeout(connTimer);
      if (!settled) {
        settled = true;
        reject(new Error(msg));
      }
    };

    client.once('ready', () => {
      clearTimeout(connTimer);
      client.shell(
        { term: 'xterm-256color', cols, rows, width: cols * 8, height: rows * 17 },
        (err, stream) => {
          if (err) {
            client.end();
            return fail(`打开 shell 失败：${err.message}`);
          }
          sessions.set(sessionId, {
            id: sessionId,
            serverId: server.id,
            client,
            shell: stream,
            createdAt: Date.now(),
          });
          settled = true;

          stream.setEncoding('utf8');
          stream.stderr.setEncoding('utf8');
          stream.on('data', (chunk: string) => ev.data(sessionId, chunk));
          stream.stderr.on('data', (chunk: string) => ev.data(sessionId, chunk));
          stream.on('close', (code: number | null) => {
            sessions.delete(sessionId);
            client.end();
            ev.exit(sessionId, code);
          });
          resolve(sessionId);
        },
      );
    });

    client.once('error', (err) => fail(err.message));
    client.on('close', () => {
      clearTimeout(connTimer);
      const s = sessions.get(sessionId);
      if (s) {
        sessions.delete(sessionId);
        ev.exit(sessionId, null, '连接已断开');
      }
    });

    try {
      client.connect({ ...baseConfig(server), ...auth });
    } catch (e: any) {
      fail(e?.message ?? String(e));
    }
  });
}

export function writeSession(sessionId: string, data: string) {
  const s = sessions.get(sessionId);
  if (!s) throw new Error('会话不存在或已关闭');
  s.shell.write(data);
}

export function resizeSession(sessionId: string, cols: number, rows: number) {
  const s = sessions.get(sessionId);
  if (!s) return;
  try {
    s.shell.setWindow(rows, cols, 0, 0);
  } catch {
    /* 部分服务器不支持窗口调整，忽略 */
  }
}

export function closeSession(sessionId: string) {
  const s = sessions.get(sessionId);
  if (!s) return;
  try {
    s.shell.end();
  } catch {
    /* ignore */
  }
  try {
    s.client.end();
  } catch {
    /* ignore */
  }
  sessions.delete(sessionId);
}

export function listSessions() {
  return [...sessions.values()].map((s) => ({
    sessionId: s.id,
    serverId: s.serverId,
    createdAt: s.createdAt,
  }));
}

export function closeAllSessions() {
  for (const id of [...sessions.keys()]) closeSession(id);
}

export function closeServerSessions(serverId: string) {
  for (const s of [...sessions.values()]) {
    if (s.serverId === serverId) closeSession(s.id);
  }
}

/* ------------------------------------------------------------------ */
/*  系统信息 & 指标采集                                                */
/* ------------------------------------------------------------------ */

/**
 * 采集一次指标。只用 POSIX 通用命令，尽量兼容 Debian/Ubuntu/CentOS/Alpine/Amazon Linux。
 * CPU 采用 0.5 秒前后两次 /proc/stat 差分计算实时使用率，而非开机以来的累计平均值。
 */
export async function collectMetrics(server: ServerRecord): Promise<MetricSample> {
  const script = [
    "awk '/^cpu /{t=0; for(i=2;i<=9;i++) t+=$i; printf \"cpu1 %.0f %.0f\\n\", t, $5+$6}' /proc/stat",
    "cat /proc/meminfo | awk '/^MemTotal:/{t=$2}/^MemAvailable:/{a=$2}END{if(t>0) printf \"mem %.0f %.0f\\n\", (t-a), t}'",
    "df -kP / | awk 'NR==2{printf \"disk %.0f %.0f\\n\", $3, $2}'",
    "awk '{printf \"load %s\\n\", $1}' /proc/loadavg",
    "awk '{printf \"uptime %d\\n\", $1}' /proc/uptime",
    "cat /proc/net/dev | awk 'NR>2 && $1 !~ /^lo:/{gsub(\":\",\" \"); rx+=$2; tx+=$10} END{printf \"net %.0f %.0f\\n\", rx, tx}'",
    "ls /proc | grep -c '^[0-9]' | awk '{printf \"proc %d\\n\", $1}'",
    "sleep 0.5",
    "awk '/^cpu /{t=0; for(i=2;i<=9;i++) t+=$i; printf \"cpu2 %.0f %.0f\\n\", t, $5+$6}' /proc/stat",
  ].join('; ');

  const { stdout } = await execOn(server, script, 15000);
  const sample: MetricSample = { t: Date.now() };
  let cpu1: [number, number] | null = null;
  let cpu2: [number, number] | null = null;

  for (const line of stdout.split('\n')) {
    const [k, ...vals] = line.trim().split(/\s+/);
    if (k === 'cpu1') {
      cpu1 = [parseFloat(vals[0]) || 0, parseFloat(vals[1]) || 0];
    } else if (k === 'cpu2') {
      cpu2 = [parseFloat(vals[0]) || 0, parseFloat(vals[1]) || 0];
    } else if (k === 'cpu') {
      sample.cpu = parseFloat(vals[0]);
    } else if (k === 'mem') {
      sample.memUsed = (parseFloat(vals[0]) || 0) * 1024;
      sample.memTotal = (parseFloat(vals[1]) || 0) * 1024;
    } else if (k === 'disk') {
      sample.diskUsed = (parseFloat(vals[0]) || 0) * 1024;
      sample.diskTotal = (parseFloat(vals[1]) || 0) * 1024;
    } else if (k === 'load') sample.load1 = parseFloat(vals[0]);
    else if (k === 'uptime') sample.uptimeSec = parseInt(vals[0], 10);
    else if (k === 'net') {
      sample.netRx = parseFloat(vals[0]) || 0;
      sample.netTx = parseFloat(vals[1]) || 0;
    } else if (k === 'proc') sample.processes = parseInt(vals[0], 10);
  }

  if (cpu1 && cpu2) {
    const dt = cpu2[0] - cpu1[0];
    const didle = cpu2[1] - cpu1[1];
    sample.cpu = dt > 0 ? Math.max(0, Math.min(100, ((dt - didle) / dt) * 100)) : 0;
  }

  return sample;
}

/** 登录后采集系统信息用于列表展示 */
export async function detectOs(server: ServerRecord): Promise<string> {
  const cmd =
    "(. /etc/os-release 2>/dev/null && echo $PRETTY_NAME) || (lsb_release -ds 2>/dev/null) || uname -sr";
  try {
    const { stdout } = await execOn(server, cmd, 12000);
    return stdout.trim().split('\n')[0] || 'Unknown';
  } catch {
    return 'Unknown';
  }
}

/* ------------------------------------------------------------------ */
/*  SFTP 文件管理                                                      */
/* ------------------------------------------------------------------ */

/** 用 SFTP 列目录，返回结构化条目（含软链接指向目录的真实识别） */
export async function listRemoteDir(server: ServerRecord, remotePath: string): Promise<RemoteFileEntry[]> {
  const client = await connectTransient(server);
  return new Promise((resolve, reject) => {
    client.sftp((err, sftp) => {
      if (err) {
        client.end();
        return reject(err);
      }
      sftp.readdir(remotePath, async (err2, list) => {
        if (err2) {
          client.end();
          return reject(err2);
        }
        try {
          const entries: RemoteFileEntry[] = await Promise.all(
            list
              .filter((i) => i.filename !== '.' && i.filename !== '..')
              .map(async (i) => {
                const attrs = i.attrs;
                const mode = attrs.mode ?? 0;
                let isDir = (mode & 0o170000) === 0o040000;
                const isSymlink = (mode & 0o170000) === 0o120000;
                const entryPath = path.posix.join(remotePath, i.filename);
                if (isSymlink) {
                  try {
                    const targetSt = await new Promise<any>((res, rej) =>
                      sftp.stat(entryPath, (eStat, st) => (eStat ? rej(eStat) : res(st))),
                    );
                    if (targetSt && ((targetSt.mode ?? 0) & 0o170000) === 0o040000) {
                      isDir = true;
                    }
                  } catch {
                    /* 悬空软链保持 isDir = false */
                  }
                }
                return {
                  name: i.filename,
                  path: entryPath,
                  size: attrs.size ?? 0,
                  isDir,
                  isSymlink,
                  mode: modeToString(mode),
                  mtime: (attrs.mtime ?? 0) * 1000,
                  owner: String(attrs.uid ?? ''),
                  group: String(attrs.gid ?? ''),
                };
              }),
          );
          entries.sort((a, b) => {
            if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
          client.end();
          resolve(entries);
        } catch (e) {
          client.end();
          reject(e);
        }
      });
    });
  });
}

function modeToString(mode: number): string {
  const types = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
  const t = mode & 0o170000;
  const typeChar =
    t === 0o040000 ? 'd' : t === 0o120000 ? 'l' : t === 0o140000 ? 's' : t === 0o010000 ? 'p' : '-';
  const perm =
    types[(mode >> 6) & 7] + types[(mode >> 3) & 7] + types[mode & 7];
  return typeChar + perm;
}

/** 上传本地文件到远端 */
export async function uploadFile(
  server: ServerRecord,
  localPath: string,
  remotePath: string,
  onProgress?: (transferred: number, total: number) => void,
): Promise<void> {
  const client = await connectTransient(server);
  return new Promise((resolve, reject) => {
    client.sftp(async (err, sftp) => {
      if (err) {
        client.end();
        return reject(err);
      }
      try {
        const stat = await fs.stat(localPath);
        const total = stat.size;
        sftp.fastPut(
          localPath,
          remotePath,
          {
            step: (transferred) => onProgress?.(transferred, total),
          },
          (err2) => {
            client.end();
            if (err2) return reject(err2);
            resolve();
          },
        );
      } catch (e) {
        client.end();
        reject(e);
      }
    });
  });
}

/** 下载远端文件到本地 */
export async function downloadFile(
  server: ServerRecord,
  remotePath: string,
  localPath: string,
  onProgress?: (transferred: number, total: number) => void,
): Promise<void> {
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  const client = await connectTransient(server);
  return new Promise((resolve, reject) => {
    client.sftp((err, sftp) => {
      if (err) {
        client.end();
        return reject(err);
      }
      sftp.stat(remotePath, (_errStat, st) => {
        const total = st?.size ?? 0;
        sftp.fastGet(
          remotePath,
          localPath,
          { step: (transferred) => onProgress?.(transferred, total) },
          (err2) => {
            client.end();
            if (err2) return reject(err2);
            resolve();
          },
        );
      });
    });
  });
}

/** 删除远端文件或目录 */
export async function deleteRemote(server: ServerRecord, remotePath: string, isDir: boolean): Promise<void> {
  const client = await connectTransient(server);
  return new Promise((resolve, reject) => {
    client.sftp((err, sftp) => {
      if (err) {
        client.end();
        return reject(err);
      }
      const done = (e?: Error | null) => {
        client.end();
        if (e) return reject(e);
        resolve();
      };
      if (isDir) sftp.rmdir(remotePath, done);
      else sftp.unlink(remotePath, done);
    });
  });
}

/** 创建目录 */
export async function mkdirRemote(server: ServerRecord, remotePath: string): Promise<void> {
  const client = await connectTransient(server);
  return new Promise((resolve, reject) => {
    client.sftp((err, sftp) => {
      if (err) {
        client.end();
        return reject(err);
      }
      sftp.mkdir(remotePath, (e) => {
        client.end();
        if (e) return reject(e);
        resolve();
      });
    });
  });
}

/** 读取远端文本文件（用于内置编辑器，上限 1MB 并严格校验 UTF-8） */
export async function readRemoteFile(server: ServerRecord, remotePath: string, maxBytes = 1024 * 1024): Promise<string> {
  const client = await connectTransient(server);
  return new Promise((resolve, reject) => {
    client.sftp((err, sftp) => {
      if (err) {
        client.end();
        return reject(err);
      }
      sftp.stat(remotePath, (statErr, st) => {
        if (statErr) {
          client.end();
          return reject(statErr);
        }
        if (st.size > maxBytes) {
          client.end();
          return reject(new Error('文件超过 1 MB，不支持内置编辑'));
        }
        const chunks: Buffer[] = [];
        let total = 0;
        const rs = sftp.createReadStream(remotePath);
        rs.on('data', (chunk: Buffer) => {
          total += chunk.length;
          if (total > maxBytes) {
            rs.destroy(new Error('文件超过 1 MB，不支持内置编辑'));
            return;
          }
          chunks.push(chunk);
        });
        rs.on('error', (e: Error) => {
          client.end();
          reject(e);
        });
        rs.on('end', () => {
          client.end();
          const buf = Buffer.concat(chunks);
          try {
            const text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
            resolve(text);
          } catch {
            reject(new Error('该文件包含二进制内容或非 UTF-8 编码，不支持内置文本编辑'));
          }
        });
      });
    });
  });
}

/** 写入远端文本文件：直接通过 SFTP 覆写原路径，保持原文件的权限、属主、软链接指向和 SELinux 上下文不变 */
export async function writeRemoteFile(server: ServerRecord, remotePath: string, content: string): Promise<void> {
  const client = await connectTransient(server);
  return new Promise<void>((resolve, reject) => {
    client.sftp((err, sftp) => {
      if (err) {
        client.end();
        return reject(err);
      }
      const stream = sftp.createWriteStream(remotePath, { flags: 'w' });
      stream.on('close', () => {
        client.end();
        resolve();
      });
      stream.on('error', (e: Error) => {
        client.end();
        reject(e);
      });
      stream.end(Buffer.from(content, 'utf8'));
    });
  });
}

/** 获取家目录，作为文件管理器初始路径 */
export async function homeDir(server: ServerRecord): Promise<string> {
  try {
    const { stdout } = await execOn(server, 'echo $HOME', 8000);
    const p = stdout.trim();
    return p || '/';
  } catch {
    return '/';
  }
}

/** 获取远程主机进程列表（按 CPU 降序） */
export async function listProcesses(server: ServerRecord): Promise<ProcessInfo[]> {
  const cmd = `ps -eo pid,user,%cpu,%mem,comm,args --sort=-%cpu 2>/dev/null || ps aux`;
  const { stdout } = await execOn(server, cmd, 10000);
  const lines = stdout.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];

  const results: ProcessInfo[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length >= 5) {
      const pid = parseInt(parts[0], 10);
      if (isNaN(pid)) continue;
      const user = parts[1];
      const cpu = parseFloat(parts[2]) || 0;
      const mem = parseFloat(parts[3]) || 0;
      const comm = parts[4];
      const args = parts.slice(5).join(' ') || comm;
      results.push({ pid, user, cpu, mem, comm, args });
    }
  }
  return results.slice(0, 50);
}

/** 终止远程进程 */
export async function killProcess(
  server: ServerRecord,
  pid: number,
  signal: string = 'TERM'
): Promise<boolean> {
  const safeSig = signal === 'KILL' ? 'KILL' : 'TERM';
  const { code } = await execOn(server, `kill -${safeSig} ${pid}`, 8000);
  return code === 0;
}

/** 获取常见 Systemd 核心服务状态 */
export async function listSystemServices(server: ServerRecord): Promise<{ available: boolean; services: SystemServiceInfo[] }> {
  const patterns = [
    'nginx*',
    'docker*',
    'sshd*',
    'mysql*',
    'mariadb*',
    'redis*',
    'postgresql*',
    'crond*',
    'cron*',
    'firewalld*',
    'ufw*',
    'network*',
    'systemd-journald*',
    'cloud*',
    'AliYunDun*',
  ];
  const cmd = `systemctl list-units --type=service ${patterns.join(' ')} --no-pager --no-legend 2>/dev/null || systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null | head -n 30`;
  try {
    const { stdout, code } = await execOn(server, cmd, 8000);
    if (!stdout.trim()) {
      return { available: true, services: [] };
    }
    const lines = stdout.trim().split(/\r?\n/);
    const services: SystemServiceInfo[] = [];
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4) {
        const rawName = parts[0].replace(/\.service$/, '');
        const load = parts[1];
        const active = parts[2];
        const sub = parts[3];
        const description = parts.slice(4).join(' ') || rawName;
        services.push({ name: rawName, load, active, sub, description });
      }
    }
    return { available: true, services };
  } catch {
    return { available: false, services: [] };
  }
}

/** 管理系统服务 (start, stop, restart, logs) */
export async function manageSystemService(
  server: ServerRecord,
  serviceName: string,
  action: 'start' | 'stop' | 'restart' | 'logs'
): Promise<{ ok: boolean; message: string }> {
  const safeName = serviceName.replace(/[^a-zA-Z0-9_\-\.]/g, '');
  if (action === 'logs') {
    const { stdout, stderr } = await execOn(server, `journalctl -u ${safeName} -n 35 --no-pager 2>&1`, 8000);
    return { ok: true, message: stdout || stderr || '(暂无日志)' };
  }
  const { code, stderr, stdout } = await execOn(server, `systemctl ${action} ${safeName}`, 10000);
  return { ok: code === 0, message: stderr || stdout || '操作完成' };
}

/** 获取 Docker 容器列表 */
export async function listDockerContainers(server: ServerRecord): Promise<{ hasDocker: boolean; containers: DockerContainerInfo[] }> {
  const cmd = `docker ps -a --format '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.State}}\t{{.Ports}}' 2>/dev/null`;
  try {
    const { stdout, code } = await execOn(server, cmd, 8000);
    if (code !== 0) return { hasDocker: false, containers: [] };
    const lines = stdout.trim().split(/\r?\n/);
    if (lines.length === 1 && !lines[0].trim()) {
      return { hasDocker: true, containers: [] };
    }
    const containers: DockerContainerInfo[] = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const [id = '', names = '', image = '', status = '', state = '', ports = ''] = line.split('\t');
      containers.push({ id, names, image, status, state, ports });
    }
    return { hasDocker: true, containers };
  } catch {
    return { hasDocker: false, containers: [] };
  }
}

/** 管理 Docker 容器 (restart, stop, start, logs) */
export async function manageDockerContainer(
  server: ServerRecord,
  containerId: string,
  action: 'restart' | 'stop' | 'start' | 'logs'
): Promise<{ ok: boolean; message: string }> {
  const safeId = containerId.replace(/[^a-zA-Z0-9_\-\.]/g, '');
  if (action === 'logs') {
    const { stdout, stderr } = await execOn(server, `docker logs --tail 40 ${safeId} 2>&1`, 8000);
    return { ok: true, message: stdout || stderr || '(无日志输出)' };
  }
  const { code, stderr, stdout } = await execOn(server, `docker ${action} ${safeId}`, 12000);
  return { ok: code === 0, message: stderr || stdout || '操作完成' };
}

