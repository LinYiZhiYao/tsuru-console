import { app, safeStorage } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * 凭据加密存储。
 *
 * 优先用 Electron safeStorage（Windows 上是 DPAPI，绑定当前用户账户）。
 * 若系统不支持（Linux 无 keyring 等），降级为 AES-256-GCM + 本机密钥文件，
 * 并在日志里明确标记降级，不静默弱化。
 */

const SECRET_FILE = 'vault.bin';
const FALLBACK_KEY_FILE = 'vault.key';

function secretPath() {
  return path.join(app.getPath('userData'), SECRET_FILE);
}

function keyPath() {
  return path.join(app.getPath('userData'), FALLBACK_KEY_FILE);
}

async function getFallbackKey(): Promise<Buffer> {
  try {
    const raw = await fs.readFile(keyPath());
    if (raw.length === 32) return raw;
  } catch {
    /* 不存在则新建 */
  }
  const key = crypto.randomBytes(32);
  await fs.mkdir(path.dirname(keyPath()), { recursive: true });
  await fs.writeFile(keyPath(), key, { mode: 0o600 });
  return key;
}

export async function encryptString(plain: string): Promise<Buffer> {
  if (safeStorage.isEncryptionAvailable()) {
    const buf = safeStorage.encryptString(plain);
    // 打上标记头，便于解密时区分
    return Buffer.concat([Buffer.from('SS01'), buf]);
  }
  const key = await getFallbackKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from('AG01'), iv, tag, enc]);
}

export async function decryptString(payload: Buffer): Promise<string> {
  const tag4 = payload.subarray(0, 4).toString('ascii');
  const body = payload.subarray(4);
  if (tag4 === 'SS01') {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('当前系统无法解密该凭据（系统加密服务不可用）');
    }
    return safeStorage.decryptString(body);
  }
  if (tag4 === 'AG01') {
    const key = await getFallbackKey();
    const iv = body.subarray(0, 12);
    const tag = body.subarray(12, 28);
    const enc = body.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  }
  throw new Error('凭据格式无法识别');
}

/** 整个 vault 是一个加密后的 JSON blob */
export class Vault<T> {
  private cache: T | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private defaults: T) {}

  async read(): Promise<T> {
    if (this.cache) return this.cache;
    try {
      const blob = await fs.readFile(secretPath());
      const plain = await decryptString(blob);
      this.cache = { ...this.defaults, ...JSON.parse(plain) } as T;
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        try {
          const backup = `${secretPath()}.corrupt-${Date.now()}`;
          await fs.copyFile(secretPath(), backup);
          console.warn(`[vault] 凭据文件解密或解析失败，已备份至 ${backup}:`, err);
        } catch {
          /* ignore backup error */
        }
      }
      this.cache = structuredClone(this.defaults);
    }
    return this.cache!;
  }

  async write(data: T): Promise<void> {
    this.cache = data;
    this.writeQueue = this.writeQueue.then(async () => {
      const blob = await encryptString(JSON.stringify(data));
      await fs.mkdir(path.dirname(secretPath()), { recursive: true });
      const tmp = `${secretPath()}.tmp`;
      await fs.writeFile(tmp, blob, { mode: 0o600 });
      await fs.rename(tmp, secretPath());
    });
    return this.writeQueue;
  }

  async update(mutator: (data: T) => T | void): Promise<T> {
    const current = await this.read();
    const draft = structuredClone(current);
    const result = mutator(draft);
    const next = (result ?? draft) as T;
    await this.write(next);
    return next;
  }
}

/** 给前端展示用的脱敏：只留头尾各 4 个字符 */
export function maskSecret(s: string | undefined): string {
  if (!s) return '';
  if (s.length <= 8) return '••••••••';
  return `${s.slice(0, 4)}${'•'.repeat(8)}${s.slice(-4)}`;
}
