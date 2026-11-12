import { app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * 极简 JSON 持久化存储。
 * 不用 electron-store：它不适合存大型凭据，且我们想完全掌控加密与文件位置。
 */
export class JsonStore<T> {
  private filePath: string;
  private cache: T | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private defaults: T;

  constructor(filename: string, defaults: T) {
    this.filePath = path.join(app.getPath('userData'), filename);
    this.defaults = defaults;
  }

  get path(): string {
    return this.filePath;
  }

  async read(): Promise<T> {
    if (this.cache) return this.cache;
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      this.cache = { ...this.defaults, ...JSON.parse(raw) } as T;
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        try {
          const backup = `${this.filePath}.corrupt-${Date.now()}`;
          await fs.copyFile(this.filePath, backup);
          console.warn(`[store] ${this.filePath} 解析失败，已备份至 ${backup}:`, err);
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
    // 串行化写入，避免并发写导致的文件损坏
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
      await fs.rename(tmp, this.filePath);
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

  async clear(): Promise<void> {
    this.cache = structuredClone(this.defaults);
    await this.write(this.cache);
  }
}
