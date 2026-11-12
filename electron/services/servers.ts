import { randomUUID } from 'crypto';
import { db, vault, metricsStore } from '../db';
import { detectOs, closeServerSessions } from './ssh';
import type { ServerRecord, ServerSecret } from '../types';

export interface CreateServerInput {
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: ServerRecord['authMethod'];
  origin?: ServerRecord['origin'];
  instanceId?: string;
  region?: string;
  cloudAccountId?: string;
  tags?: string[];
  note?: string;
  secret?: {
    password?: string;
    privateKey?: string;
    passphrase?: string;
  };
}

export async function listServers(): Promise<ServerRecord[]> {
  return (await db.read()).servers;
}

export async function getServer(id: string): Promise<ServerRecord | undefined> {
  return (await db.read()).servers.find((s) => s.id === id);
}

export async function createServer(input: CreateServerInput): Promise<ServerRecord> {
  const now = Date.now();
  const record: ServerRecord = {
    id: randomUUID(),
    name: input.name.trim(),
    host: input.host.trim(),
    port: input.port || 22,
    username: input.username.trim() || 'root',
    authMethod: input.authMethod,
    origin: input.origin ?? 'manual',
    instanceId: input.instanceId,
    region: input.region,
    cloudAccountId: input.cloudAccountId,
    tags: input.tags ?? [],
    note: input.note,
    status: 'unknown',
    createdAt: now,
    updatedAt: now,
  };

  if (input.secret) {
    await setSecret(record.id, input.secret);
  }

  await db.update((d) => {
    d.servers.push(record);
  });

  return record;
}

export async function updateServer(
  id: string,
  patch: Partial<CreateServerInput>,
): Promise<ServerRecord> {
  if (patch.secret) await setSecret(id, patch.secret);
  let updated: ServerRecord | undefined;
  await db.update((d) => {
    const s = d.servers.find((x) => x.id === id);
    if (!s) throw new Error('服务器不存在');
    if (patch.name !== undefined) s.name = patch.name.trim();
    if (patch.host !== undefined) s.host = patch.host.trim();
    if (patch.port !== undefined) s.port = patch.port;
    if (patch.username !== undefined) s.username = patch.username.trim();
    if (patch.authMethod !== undefined) s.authMethod = patch.authMethod;
    if (patch.tags !== undefined) s.tags = patch.tags;
    if (patch.note !== undefined) s.note = patch.note;
    s.updatedAt = Date.now();
    updated = s;
  });
  return updated!;
}

export async function deleteServer(id: string): Promise<void> {
  closeServerSessions(id);
  await db.update((d) => {
    d.servers = d.servers.filter((s) => s.id !== id);
  });
  await vault.update((v) => {
    v.serverSecrets = v.serverSecrets.filter((s) => s.serverId !== id);
  });
  await metricsStore.update((m) => {
    delete m.series[id];
    m.rules = m.rules.filter((r) => r.serverId !== id);
  });
}

export async function setSecret(
  serverId: string,
  secret: { password?: string; privateKey?: string; passphrase?: string },
): Promise<void> {
  await vault.update((v) => {
    const idx = v.serverSecrets.findIndex((s) => s.serverId === serverId);
    const entry: ServerSecret = { serverId, ...secret };
    if (idx >= 0) v.serverSecrets[idx] = entry;
    else v.serverSecrets.push(entry);
  });
}

/** 只返回「有没有设置」这类布尔信息，绝不把明文送到渲染进程 */
export async function getSecretFlags(serverId: string) {
  const v = await vault.read();
  const s = v.serverSecrets.find((x) => x.serverId === serverId);
  return {
    hasPassword: Boolean(s?.password),
    hasPrivateKey: Boolean(s?.privateKey),
    hasPassphrase: Boolean(s?.passphrase),
  };
}

/** 采集一次系统信息并落库 */
export async function refreshOsInfo(id: string): Promise<string> {
  const server = await getServer(id);
  if (!server) throw new Error('服务器不存在');
  const os = await detectOs(server);
  await db.update((d) => {
    const s = d.servers.find((x) => x.id === id);
    if (s) {
      s.os = os;
      s.updatedAt = Date.now();
    }
  });
  return os;
}

/** 云实例纳管：把云上的实例转成本地一条服务器记录 */
export async function importCloudInstance(params: {
  provider: ServerRecord['origin'];
  instanceId: string;
  name: string;
  host: string;
  region: string;
  cloudAccountId: string;
  username: string;
  port: number;
  authMethod: ServerRecord['authMethod'];
  secret?: { password?: string; privateKey?: string; passphrase?: string };
}): Promise<ServerRecord> {
  // 已存在则直接返回，避免重复纳管
  const existing = (await db.read()).servers.find(
    (s) => s.instanceId === params.instanceId && s.origin === params.provider,
  );
  if (existing) return existing;

  return createServer({
    name: params.name,
    host: params.host,
    port: params.port,
    username: params.username,
    authMethod: params.authMethod,
    origin: params.provider,
    instanceId: params.instanceId,
    region: params.region,
    cloudAccountId: params.cloudAccountId,
    secret: params.secret,
    tags: [params.provider, params.region],
  });
}
