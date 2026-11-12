import { ipcMain } from 'electron';
import { db, vault } from '../db';
import { emit } from '../bus';
import * as servers from '../services/servers';
import * as ssh from '../services/ssh';
import * as monitor from '../services/monitor';
import { createDriver } from '../services/cloud';
import type { CloudCredentials, AlertRule, BatchExecResult } from '../types';

/** 统一的 handler 包装：把异常转成 { ok:false, error } 而不是让渲染进程拿到 stack */
function handle<T extends any[], R>(channel: string, fn: (...args: T) => Promise<R> | R) {
  ipcMain.handle(channel, async (_e, ...args: T) => {
    try {
      const data = await fn(...args);
      return { ok: true, data };
    } catch (err: any) {
      console.error(`[ipc] ${channel} 失败:`, err);
      return { ok: false, error: err?.message ?? String(err) };
    }
  });
}

export function registerIpc() {
  /* ---------------- 服务器 CRUD ---------------- */
  handle('servers:list', () => servers.listServers());
  handle('servers:get', (id: string) => servers.getServer(id));
  handle('servers:create', (input: servers.CreateServerInput) => servers.createServer(input));
  handle('servers:update', (id: string, patch: Partial<servers.CreateServerInput>) =>
    servers.updateServer(id, patch),
  );
  handle('servers:delete', (id: string) => servers.deleteServer(id));
  handle('servers:secretFlags', (id: string) => servers.getSecretFlags(id));
  handle('servers:refreshOs', (id: string) => servers.refreshOsInfo(id));

  /* ---------------- 测试连接 / 探测 ---------------- */
  handle('servers:probe', async (id: string) => {
    const server = await servers.getServer(id);
    if (!server) throw new Error('服务器不存在');
    const { latencyMs } = await ssh.probeServer(server);
    await db.update((d) => {
      const s = d.servers.find((x) => x.id === id);
      if (s) {
        s.status = 'online';
        s.latencyMs = latencyMs;
        s.lastSeenAt = Date.now();
      }
    });
    emit('server:status', { serverId: id, status: 'online', latencyMs });
    const os = await servers.refreshOsInfo(id);
    return { latencyMs, os };
  });

  /* ---------------- 进程管理 ---------------- */
  handle('servers:processes', async (id: string) => {
    const server = await servers.getServer(id);
    if (!server) throw new Error('服务器不存在');
    return ssh.listProcesses(server);
  });

  handle('servers:killProcess', async (id: string, pid: number, signal?: string) => {
    const server = await servers.getServer(id);
    if (!server) throw new Error('服务器不存在');
    return ssh.killProcess(server, pid, signal);
  });

  /* ---------------- 服务与 Docker 管理 ---------------- */
  handle('servers:services', async (id: string) => {
    const server = await servers.getServer(id);
    if (!server) throw new Error('服务器不存在');
    return ssh.listSystemServices(server);
  });

  handle('servers:manageService', async (id: string, name: string, action: 'start' | 'stop' | 'restart' | 'logs') => {
    const server = await servers.getServer(id);
    if (!server) throw new Error('服务器不存在');
    return ssh.manageSystemService(server, name, action);
  });

  handle('servers:dockerContainers', async (id: string) => {
    const server = await servers.getServer(id);
    if (!server) throw new Error('服务器不存在');
    return ssh.listDockerContainers(server);
  });

  handle('servers:manageDocker', async (id: string, containerId: string, action: 'start' | 'stop' | 'restart' | 'logs') => {
    const server = await servers.getServer(id);
    if (!server) throw new Error('服务器不存在');
    return ssh.manageDockerContainer(server, containerId, action);
  });

  handle('servers:exec', async (id: string, command: string, timeoutMs?: number) => {
    const server = await servers.getServer(id);
    if (!server) throw new Error('服务器不存在');
    return ssh.execOn(server, command, timeoutMs ?? 30000);
  });

  /** 未保存的临时配置也能测（新增弹窗里「测试连接」用，内存直传凭据，不落盘） */
  handle(
    'servers:testDraft',
    async (draft: {
      host: string;
      port: number;
      username: string;
      authMethod: 'password' | 'privateKey' | 'agent';
      password?: string;
      privateKey?: string;
      passphrase?: string;
    }) => {
      const temp = {
        id: '__draft__',
        name: 'draft',
        host: draft.host,
        port: draft.port,
        username: draft.username,
        authMethod: draft.authMethod,
        origin: 'manual' as const,
        tags: [],
        status: 'unknown' as const,
        createdAt: 0,
        updatedAt: 0,
      };
      const started = Date.now();
      const client = await ssh.connectTransient(temp as any, {
        password: draft.password,
        privateKey: draft.privateKey,
        passphrase: draft.passphrase,
      });
      const latencyMs = Date.now() - started;
      client.end();
      return { latencyMs };
    },
  );

  /* ---------------- 终端会话 ---------------- */
  handle('terminal:open', async (serverId: string, cols: number, rows: number) => {
    const server = await servers.getServer(serverId);
    if (!server) throw new Error('服务器不存在');
    const sessionId = await ssh.openSession(server, cols, rows, {
      data: (sid, data) => emit('terminal:data', { sessionId: sid, data }),
      exit: (sid, code, message) => emit('terminal:exit', { sessionId: sid, code, message }),
    });
    return { sessionId };
  });
  handle('terminal:write', (sessionId: string, data: string) => ssh.writeSession(sessionId, data));
  handle('terminal:resize', (sessionId: string, cols: number, rows: number) =>
    ssh.resizeSession(sessionId, cols, rows),
  );
  handle('terminal:close', (sessionId: string) => ssh.closeSession(sessionId));
  handle('terminal:list', () => ssh.listSessions());

  /* ---------------- 文件管理 ---------------- */
  handle('files:home', async (serverId: string) => {
    const server = await servers.getServer(serverId);
    if (!server) throw new Error('服务器不存在');
    return ssh.homeDir(server);
  });
  handle('files:list', async (serverId: string, remotePath: string) => {
    const server = await servers.getServer(serverId);
    if (!server) throw new Error('服务器不存在');
    return ssh.listRemoteDir(server, remotePath);
  });
  handle('files:delete', async (serverId: string, remotePath: string, isDir: boolean) => {
    const server = await servers.getServer(serverId);
    if (!server) throw new Error('服务器不存在');
    return ssh.deleteRemote(server, remotePath, isDir);
  });
  handle('files:mkdir', async (serverId: string, remotePath: string) => {
    const server = await servers.getServer(serverId);
    if (!server) throw new Error('服务器不存在');
    return ssh.mkdirRemote(server, remotePath);
  });
  handle('files:read', async (serverId: string, remotePath: string) => {
    const server = await servers.getServer(serverId);
    if (!server) throw new Error('服务器不存在');
    return ssh.readRemoteFile(server, remotePath);
  });
  handle('files:write', async (serverId: string, remotePath: string, content: string) => {
    const server = await servers.getServer(serverId);
    if (!server) throw new Error('服务器不存在');
    return ssh.writeRemoteFile(server, remotePath, content);
  });
  handle(
    'files:upload',
    async (serverId: string, localPath: string, remotePath: string) => {
      const server = await servers.getServer(serverId);
      if (!server) throw new Error('服务器不存在');
      return ssh.uploadFile(server, localPath, remotePath);
    },
  );
  handle(
    'files:download',
    async (serverId: string, remotePath: string, localPath: string) => {
      const server = await servers.getServer(serverId);
      if (!server) throw new Error('服务器不存在');
      return ssh.downloadFile(server, remotePath, localPath);
    },
  );

  /* ---------------- 批量执行 ---------------- */
  handle('batch:exec', async (serverIds: string[], command: string) => {
    const all = await db.read();
    const targets = all.servers.filter((s) => serverIds.includes(s.id));
    const results: BatchExecResult[] = [];
    // 串行执行，避免同时开太多连接
    for (const server of targets) {
      const started = Date.now();
      try {
        const r = await ssh.execOn(server, command, 60000);
        results.push({
          serverId: server.id,
          serverName: server.name,
          ok: r.code === 0,
          code: r.code,
          stdout: r.stdout,
          stderr: r.stderr,
          durationMs: Date.now() - started,
        });
      } catch (e: any) {
        results.push({
          serverId: server.id,
          serverName: server.name,
          ok: false,
          code: null,
          stdout: '',
          stderr: e?.message ?? String(e),
          durationMs: Date.now() - started,
        });
      }
    }
    return results;
  });

  /* ---------------- 监控 ---------------- */
  handle('metrics:get', (serverId: string) => monitor.getSeries(serverId));
  handle('metrics:sampleNow', (serverId: string) => monitor.sampleNow(serverId));
  handle('metrics:rules', () => monitor.getRules());
  handle('metrics:upsertRule', (rule: AlertRule) => monitor.upsertRule(rule));
  handle('metrics:deleteRule', (id: string) => monitor.deleteRule(id));
  handle('metrics:events', () => monitor.getEvents());
  handle('metrics:ackEvent', (id: string) => monitor.ackEvent(id));
  handle('metrics:clearEvents', () => monitor.clearEvents());

  /* ---------------- 云账号 ---------------- */
  async function getCloudAccountWithSecret(id: string): Promise<CloudCredentials> {
    const data = await db.read();
    const acc = data.cloudAccounts.find((a) => a.id === id);
    if (!acc) throw new Error('云账号不存在');

    const v = await vault.read();
    const secretEntry = (v.cloudSecrets ?? []).find((c) => c.accountId === id);
    if (secretEntry?.accessKeySecret) {
      return { ...acc, accessKeySecret: secretEntry.accessKeySecret };
    }
    // 兼容旧版明文存储在 nebula-db.json 中的账号，读取时自动迁移进加密 vault
    if (acc.accessKeySecret) {
      const plainSecret = acc.accessKeySecret;
      await vault.update((vd) => {
        vd.cloudSecrets = (vd.cloudSecrets ?? []).filter((c) => c.accountId !== id);
        vd.cloudSecrets.push({ accountId: id, accessKeySecret: plainSecret });
      });
      await db.update((dd) => {
        const target = dd.cloudAccounts.find((a) => a.id === id);
        if (target) target.accessKeySecret = '';
      });
      return { ...acc, accessKeySecret: plainSecret };
    }
    throw new Error('未找到该云账号的 Secret，请移除后重新接入');
  }

  handle('cloud:accounts', async () => {
    const data = await db.read();
    // 密钥脱敏后返回
    return data.cloudAccounts.map((a) => ({
      ...a,
      accessKeySecret: '••••••••',
      accessKeyId: a.accessKeyId.length > 8 ? `${a.accessKeyId.slice(0, 6)}••••` : '••••',
    }));
  });

  handle('cloud:addAccount', async (input: Omit<CloudCredentials, 'createdAt'>) => {
    await vault.update((v) => {
      v.cloudSecrets = (v.cloudSecrets ?? []).filter((c) => c.accountId !== input.id);
      v.cloudSecrets.push({ accountId: input.id, accessKeySecret: input.accessKeySecret });
    });
    const record: CloudCredentials = {
      ...input,
      accessKeySecret: '',
      createdAt: Date.now(),
    };
    await db.update((d) => {
      d.cloudAccounts = d.cloudAccounts.filter((a) => a.id !== record.id);
      d.cloudAccounts.push(record);
    });
    return { id: record.id };
  });

  handle('cloud:deleteAccount', async (id: string) => {
    await db.update((d) => {
      d.cloudAccounts = d.cloudAccounts.filter((a) => a.id !== id);
    });
    await vault.update((v) => {
      v.cloudSecrets = (v.cloudSecrets ?? []).filter((c) => c.accountId !== id);
    });
  });

  handle('cloud:verify', async (id: string) => {
    const acc = await getCloudAccountWithSecret(id);
    return createDriver(acc).verify();
  });

  handle('cloud:listInstances', async (id: string) => {
    const data = await db.read();
    const acc = await getCloudAccountWithSecret(id);
    const driver = createDriver(acc);
    emit('sync:progress', { provider: acc.provider, message: '正在获取地域列表…', done: false });
    const regions = await driver.listRegions();
    emit('sync:progress', {
      provider: acc.provider,
      message: `正在拉取 ${regions.length} 个地域的实例…`,
      done: false,
    });
    const list = await driver.listInstances(regions);
    const managedIds = new Set(data.servers.map((s) => s.instanceId).filter(Boolean));
    const withManaged = list.map((i) => ({ ...i, managed: managedIds.has(i.instanceId) }));
    emit('sync:progress', { provider: acc.provider, message: `共 ${list.length} 台实例`, done: true });
    return withManaged;
  });

  handle(
    'cloud:power',
    async (id: string, instanceId: string, region: string, action: 'start' | 'stop' | 'reboot' | 'terminate') => {
      const acc = await getCloudAccountWithSecret(id);
      await createDriver(acc).power(instanceId, region, action);
    },
  );

  handle(
    'cloud:import',
    async (params: Parameters<typeof servers.importCloudInstance>[0]) =>
      servers.importCloudInstance(params),
  );

  /* ---------------- 应用信息 ---------------- */
  handle('app:info', async () => {
    const data = await db.read();
    const v = await vault.read();
    return {
      userDataPath: (await import('electron')).app.getPath('userData'),
      serverCount: data.servers.length,
      accountCount: data.cloudAccounts.length,
      secretCount: v.serverSecrets.length + (v.cloudSecrets?.length ?? 0),
      versions: {
        electron: process.versions.electron,
        node: process.versions.node,
        chrome: process.versions.chrome,
      },
    };
  });

  handle('app:openPath', async (p: string) => {
    const { shell } = await import('electron');
    return shell.openPath(p);
  });

  handle('app:showItemInFolder', async (p: string) => {
    const { shell } = await import('electron');
    shell.showItemInFolder(p);
  });
}
