import crypto from 'crypto';
import {
  EC2Client,
  DescribeInstancesCommand,
  DescribeRegionsCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  RebootInstancesCommand,
  TerminateInstancesCommand,
} from '@aws-sdk/client-ec2';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import type { CloudCredentials, CloudInstance, CloudProvider } from '../types';

/** 所有云厂商统一实现的接口 */
export interface CloudDriver {
  provider: CloudProvider;
  /** 验证凭据是否有效，返回账号标识 */
  verify(): Promise<string>;
  /** 列出指定区域的所有实例 */
  listInstances(regions: string[]): Promise<CloudInstance[]>;
  /** 列出可用区域 */
  listRegions(): Promise<string[]>;
  /** 电源操作 */
  power(instanceId: string, region: string, action: 'start' | 'stop' | 'reboot' | 'terminate'): Promise<void>;
}

/* ------------------------------------------------------------------ */
/*  AWS 驱动                                                          */
/* ------------------------------------------------------------------ */

const AWS_DEFAULT_REGIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'ap-east-1',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-south-1',
  'eu-west-1',
  'eu-west-2',
  'eu-central-1',
];

export class AwsDriver implements CloudDriver {
  provider: CloudProvider = 'aws';
  private creds: { accessKeyId: string; secretAccessKey: string };

  constructor(private cfg: CloudCredentials) {
    this.creds = {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.accessKeySecret,
    };
  }

  private client(region: string) {
    return new EC2Client({ region, credentials: this.creds });
  }

  async verify(): Promise<string> {
    const sts = new STSClient({
      region: this.cfg.defaultRegion || 'us-east-1',
      credentials: this.creds,
    });
    const res = await sts.send(new GetCallerIdentityCommand({}));
    return res.Account ? `AWS 账号 ${res.Account}` : 'AWS 凭据有效';
  }

  async listRegions(): Promise<string[]> {
    if (this.cfg.regions?.length) return this.cfg.regions;
    try {
      const client = this.client(this.cfg.defaultRegion || 'us-east-1');
      const res = await client.send(new DescribeRegionsCommand({}));
      const list = (res.Regions ?? []).map((r) => r.RegionName).filter((r): r is string => Boolean(r));
      if (list.length > 0) return list;
    } catch {
      /* 无 DescribeRegions 权限时回退预设列表 */
    }
    const fallback = new Set(AWS_DEFAULT_REGIONS);
    if (this.cfg.defaultRegion) fallback.add(this.cfg.defaultRegion);
    return [...fallback];
  }

  async listInstances(regions: string[]): Promise<CloudInstance[]> {
    const out: CloudInstance[] = [];
    let successRegions = 0;
    let firstErr: any = null;
    await Promise.all(
      regions.map(async (region) => {
        try {
          const client = this.client(region);
          let nextToken: string | undefined;
          do {
            const res = await client.send(
              new DescribeInstancesCommand({ NextToken: nextToken, MaxResults: 200 }),
            );
            for (const reservation of res.Reservations ?? []) {
              for (const inst of reservation.Instances ?? []) {
                if (!inst.InstanceId) continue;
                const nameTag = inst.Tags?.find((t) => t.Key === 'Name')?.Value;
                out.push({
                  instanceId: inst.InstanceId,
                  name: nameTag || inst.InstanceId,
                  provider: 'aws',
                  region,
                  publicIp: inst.PublicIpAddress,
                  privateIp: inst.PrivateIpAddress,
                  state: inst.State?.Name ?? 'unknown',
                  instanceType: inst.InstanceType ?? '-',
                  imageId: inst.ImageId,
                  launchTime: inst.LaunchTime?.toISOString(),
                });
              }
            }
            nextToken = res.NextToken;
          } while (nextToken);
          successRegions += 1;
        } catch (e: any) {
          if (!firstErr) firstErr = e;
          // 单个区域没权限 / 未开通时跳过，不要让整体失败
          console.warn(`[aws] region ${region} 拉取失败: ${e?.name} ${e?.message}`);
        }
      }),
    );
    if (regions.length > 0 && successRegions === 0 && firstErr) {
      throw firstErr;
    }
    return out;
  }

  async power(instanceId: string, region: string, action: 'start' | 'stop' | 'reboot' | 'terminate') {
    const client = this.client(region);
    switch (action) {
      case 'start':
        await client.send(new StartInstancesCommand({ InstanceIds: [instanceId] }));
        break;
      case 'stop':
        await client.send(new StopInstancesCommand({ InstanceIds: [instanceId] }));
        break;
      case 'reboot':
        await client.send(new RebootInstancesCommand({ InstanceIds: [instanceId] }));
        break;
      case 'terminate':
        await client.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
        break;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  阿里云驱动                                                        */
/* ------------------------------------------------------------------ */

/**
 * 阿里云 ECS 用 RPC 风格 API + HMAC-SHA1 签名。
 * 不引官方 SDK：它的体积和 CJS 打包问题在 Electron 里很麻烦，
 * 这里直接按官方签名规范手写，逻辑短且可控。
 */

const ALIYUN_ENDPOINT = 'https://ecs.aliyuncs.com/';

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/\!/g, '%21')
    .replace(/\*/g, '%2A')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
}

function aliSignature(params: Record<string, string>, secret: string): string {
  const sorted = Object.keys(params).sort();
  const canonical = sorted.map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`).join('&');
  const stringToSign = `GET&${percentEncode('/')}&${percentEncode(canonical)}`;
  return crypto.createHmac('sha1', `${secret}&`).update(stringToSign).digest('base64');
}

async function aliRequest(
  creds: { ak: string; sk: string },
  action: string,
  extra: Record<string, string> = {},
): Promise<any> {
  const params: Record<string, string> = {
    Format: 'JSON',
    Version: '2014-05-26',
    AccessKeyId: creds.ak,
    SignatureMethod: 'HMAC-SHA1',
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    SignatureVersion: '1.0',
    SignatureNonce: crypto.randomUUID(),
    Action: action,
    ...extra,
  };
  params.Signature = aliSignature(params, creds.sk);

  const qs = Object.keys(params)
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join('&');

  const res = await fetch(`${ALIYUN_ENDPOINT}?${qs}`, { method: 'GET' });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.Code) {
    throw new Error(`阿里云 ${action} 失败：${json.Code ?? res.status} ${json.Message ?? ''}`);
  }
  return json;
}

const ALIYUN_COMMON_REGIONS = [
  'cn-hangzhou',
  'cn-shanghai',
  'cn-beijing',
  'cn-shenzhen',
  'cn-qingdao',
  'cn-guangzhou',
  'cn-chengdu',
  'cn-hongkong',
];

export class AliyunDriver implements CloudDriver {
  provider: CloudProvider = 'aliyun';
  private creds: { ak: string; sk: string };

  constructor(private cfg: CloudCredentials) {
    this.creds = { ak: cfg.accessKeyId, sk: cfg.accessKeySecret };
  }

  async verify(): Promise<string> {
    const res = await aliRequest(this.creds, 'DescribeRegions');
    const count = res.Regions?.Region?.length ?? 0;
    return `阿里云凭据有效（${count} 个可用地域）`;
  }

  async listRegions(): Promise<string[]> {
    if (this.cfg.regions?.length) return this.cfg.regions;
    try {
      const res = await aliRequest(this.creds, 'DescribeRegions');
      const list: string[] = (res.Regions?.Region ?? []).map((r: any) => r.RegionId);
      return list.length ? list : ALIYUN_COMMON_REGIONS;
    } catch {
      return ALIYUN_COMMON_REGIONS;
    }
  }

  async listInstances(regions: string[]): Promise<CloudInstance[]> {
    const out: CloudInstance[] = [];
    let successRegions = 0;
    let firstErr: any = null;
    for (const region of regions) {
      try {
        let page = 1;
        let total = Infinity;
        let regionFetched = 0;
        while (page <= 20) {
          const res = await aliRequest(this.creds, 'DescribeInstances', {
            RegionId: region,
            PageNumber: String(page),
            PageSize: '100',
          });
          total = res.TotalCount ?? 0;
          const list = res.Instances?.Instance ?? [];
          regionFetched += list.length;
          for (const inst of list) {
            const pub =
              inst.PublicIpAddress?.IpAddress?.find((ip: string) => !ip.startsWith('10.')) ??
              inst.EipAddress?.IpAddress;
            out.push({
              instanceId: inst.InstanceId,
              name: inst.InstanceName || inst.InstanceId,
              provider: 'aliyun',
              region,
              publicIp: pub,
              privateIp:
                inst.VpcAttributes?.PrivateIpAddress?.IpAddress?.[0] ??
                inst.InnerIpAddress?.IpAddress?.[0],
              state: inst.Status ?? 'unknown',
              instanceType: inst.InstanceType ?? '-',
              imageId: inst.ImageId,
              launchTime: inst.CreationTime,
              vcpus: inst.Cpu,
              memoryMb: inst.Memory,
            });
          }
          if (list.length === 0 || regionFetched >= total) break;
          page += 1;
        }
        successRegions += 1;
      } catch (e: any) {
        if (!firstErr) firstErr = e;
        console.warn(`[aliyun] region ${region} 拉取失败: ${e?.message}`);
      }
    }
    if (regions.length > 0 && successRegions === 0 && firstErr) {
      throw firstErr;
    }
    return out;
  }

  async power(instanceId: string, region: string, action: 'start' | 'stop' | 'reboot' | 'terminate') {
    const map = {
      start: 'StartInstance',
      stop: 'StopInstance',
      reboot: 'RebootInstance',
      terminate: 'DeleteInstance',
    } as const;
    const extra: Record<string, string> = { InstanceId: instanceId };
    if (action === 'stop') extra.ForceStop = 'false';
    await aliRequest(this.creds, map[action], extra);
  }
}

/* ------------------------------------------------------------------ */
/*  工厂                                                              */
/* ------------------------------------------------------------------ */

export function createDriver(cfg: CloudCredentials): CloudDriver {
  switch (cfg.provider) {
    case 'aws':
      return new AwsDriver(cfg);
    case 'aliyun':
      return new AliyunDriver(cfg);
    default:
      throw new Error(`不支持的云平台：${cfg.provider}`);
  }
}
