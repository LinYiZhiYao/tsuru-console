import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { JsonStore } from './utils/store';
import { Vault } from './utils/vault';
import type {
  ServerRecord,
  ServerSecret,
  CloudCredentials,
  MetricSample,
  AlertRule,
  AlertEvent,
} from './types';

/**
 * 自动迁移旧版本数据（nebula-console -> tsuru-console）
 * 确保改名后用户的服务器、凭据、监控和告警数据 100% 完整继承。
 */
function migrateLegacyUserData() {
  try {
    const current = app.getPath('userData');
    const legacy = path.join(path.dirname(current), 'nebula-console');
    if (fs.existsSync(legacy) && legacy.toLowerCase() !== current.toLowerCase()) {
      if (!fs.existsSync(current)) fs.mkdirSync(current, { recursive: true });
      const files = ['nebula-db.json', 'vault.bin', 'nebula-metrics.json'];
      for (const file of files) {
        const src = path.join(legacy, file);
        const dest = path.join(current, file);
        if (fs.existsSync(src) && !fs.existsSync(dest)) {
          fs.copyFileSync(src, dest);
          console.log(`[migrate] 已自动从旧版本继承 ${file}`);
        }
      }
    }
  } catch (e) {
    console.warn('[migrate] 旧版本数据自动迁移失败:', e);
  }
}

migrateLegacyUserData();

export interface DbShape {
  servers: ServerRecord[];
  cloudAccounts: CloudCredentials[];
}

export interface CloudSecret {
  accountId: string;
  accessKeySecret: string;
}

export interface SecretsShape {
  serverSecrets: ServerSecret[];
  cloudSecrets: CloudSecret[];
}

export interface MetricsShape {
  /** serverId -> 最近 1440 个采样点（约 6 小时 @15s） */
  series: Record<string, MetricSample[]>;
  rules: AlertRule[];
  events: AlertEvent[];
}

export const db = new JsonStore<DbShape>('nebula-db.json', {
  servers: [],
  cloudAccounts: [],
});

export const vault = new Vault<SecretsShape>({ serverSecrets: [], cloudSecrets: [] });

export const metricsStore = new JsonStore<MetricsShape>('nebula-metrics.json', {
  series: {},
  rules: [],
  events: [],
});

export const paths = {
  get userData() {
    return app.getPath('userData');
  },
};
