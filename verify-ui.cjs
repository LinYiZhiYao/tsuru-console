/**
 * 视觉验证脚本：起一个静态服务托管 dist/，用 Playwright 打开并注入 mock 的 window.nebula，
 * 然后逐页截图。用于在不开 Electron 的前提下检查 UI 布局与动画终态。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, 'dist');
const OUT = path.join(__dirname, 'shots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

/** 注入到页面的 mock API —— 覆盖所有页面用到的调用 */
function mockScript() {
  const now = Date.now();
  const servers = [
    {
      id: 's1', name: 'AWS 东京-Web-01', host: '13.231.44.18', port: 22, username: 'ubuntu',
      authMethod: 'privateKey', origin: 'aws', instanceId: 'i-0abc123def456', region: 'ap-northeast-1',
      tags: ['生产', 'web'], note: '主站前端', status: 'online', lastSeenAt: now - 8000,
      latencyMs: 42, os: 'Ubuntu 22.04.4 LTS', createdAt: now - 86400000 * 12, updatedAt: now,
    },
    {
      id: 's2', name: '阿里云-杭州-API', host: '47.96.128.33', port: 22, username: 'root',
      authMethod: 'password', origin: 'aliyun', instanceId: 'i-bp12xy34z', region: 'cn-hangzhou',
      tags: ['生产', 'api'], status: 'online', lastSeenAt: now - 4000, latencyMs: 18,
      os: 'Alibaba Cloud Linux 3', createdAt: now - 86400000 * 8, updatedAt: now,
    },
    {
      id: 's3', name: 'AWS 新加坡-DB', host: '54.169.22.7', port: 22, username: 'ec2-user',
      authMethod: 'privateKey', origin: 'aws', instanceId: 'i-0def789ghi', region: 'ap-southeast-1',
      tags: ['生产', 'db'], status: 'offline', lastSeenAt: now - 3600000 * 3, latencyMs: 210,
      os: 'Amazon Linux 2023', createdAt: now - 86400000 * 30, updatedAt: now,
    },
    {
      id: 's4', name: '阿里云-北京-测试机', host: '8.130.44.91', port: 22, username: 'root',
      authMethod: 'password', origin: 'aliyun', region: 'cn-beijing',
      tags: ['测试'], status: 'online', lastSeenAt: now - 2000, latencyMs: 26,
      os: 'CentOS Stream 9', createdAt: now - 86400000 * 3, updatedAt: now,
    },
  ];

  const accounts = [
    { id: 'a1', provider: 'aws', label: '生产账号 AWS', accessKeyId: 'AKIA••••', accessKeySecret: '••••••••', defaultRegion: 'us-east-1', createdAt: now - 86400000 * 20 },
    { id: 'a2', provider: 'aliyun', label: '阿里云-主账号', accessKeyId: 'LTAI••••', accessKeySecret: '••••••••', createdAt: now - 86400000 * 15 },
  ];

  const instances = {
    a1: [
      { instanceId: 'i-0abc123def456', name: 'AWS 东京-Web-01', provider: 'aws', region: 'ap-northeast-1', publicIp: '13.231.44.18', privateIp: '10.0.1.12', state: 'running', instanceType: 't3.medium', launchTime: new Date(now - 86400000 * 12).toISOString(), managed: true },
      { instanceId: 'i-0def789ghi', name: 'AWS 新加坡-DB', provider: 'aws', region: 'ap-southeast-1', publicIp: '54.169.22.7', privateIp: '10.0.2.8', state: 'stopped', instanceType: 't3.large', launchTime: new Date(now - 86400000 * 30).toISOString(), managed: true },
      { instanceId: 'i-0zzz999yyy', name: 'aws-batch-worker', provider: 'aws', region: 'ap-northeast-1', publicIp: '13.231.90.55', privateIp: '10.0.1.30', state: 'running', instanceType: 'c5.xlarge', launchTime: new Date(now - 86400000 * 2).toISOString(), managed: false },
    ],
    a2: [
      { instanceId: 'i-bp12xy34z', name: '阿里云-杭州-API', provider: 'aliyun', region: 'cn-hangzhou', publicIp: '47.96.128.33', privateIp: '172.16.0.9', state: 'Running', instanceType: 'ecs.c6.large', launchTime: new Date(now - 86400000 * 8).toISOString(), managed: true },
      { instanceId: 'i-bp99aa88b', name: 'aliyun-redis-proxy', provider: 'aliyun', region: 'cn-hangzhou', publicIp: '47.96.200.11', privateIp: '172.16.0.20', state: 'Running', instanceType: 'ecs.g6.large', launchTime: new Date(now - 86400000 * 5).toISOString(), managed: false },
    ],
  };

  // 造一份 30 分钟、90 个点的曲线
  const series = {};
  servers.forEach((s, idx) => {
    const arr = [];
    const base = [32, 58, 12, 44][idx];
    let accRx = 0;
    let accTx = 0;
    for (let i = 90; i >= 0; i--) {
      const t = now - i * 20000;
      const wave = Math.sin((90 - i) / 6.2) * 12;
      const noise = (Math.random() - 0.5) * 7;
      const cpu = Math.max(1, Math.min(99, base + wave + noise));
      const memTotal = idx === 1 ? 8589934592 : 4294967296;
      // 累计流量：每步增量本身要有波动，否则差分出来的速率是常数（曲线会变成一条直线）
      const step = i;
      const rxPerStep = 300000 + Math.abs(Math.sin(step / 5)) * 2200000 + Math.random() * 260000;
      const txPerStep = 90000 + Math.abs(Math.cos(step / 7)) * 700000 + Math.random() * 90000;
      accRx += rxPerStep;
      accTx += txPerStep;
      arr.push({
        t,
        cpu,
        memUsed: memTotal * (0.42 + Math.sin((90 - i) / 10) * 0.09 + Math.random() * 0.02),
        memTotal,
        diskUsed: 64424509440 * (0.61 + Math.random() * 0.004),
        diskTotal: 64424509440,
        load1: 0.6 + Math.sin((90 - i) / 8) * 0.35 + Math.random() * 0.1,
        uptimeSec: 86400 * 12 + i * 20,
        netRx: 32000000 + accRx,
        netTx: 14000000 + accTx,
        processes: 160 + Math.floor(Math.random() * 12),
      });
    }
    series[s.id] = arr;
  });

  const rules = [
    { id: 'r1', name: 'Web-01 CPU 过高', serverId: 's1', metric: 'cpu', threshold: 85, consecutive: 3, enabled: true, createdAt: now - 86400000 * 5 },
    { id: 'r2', name: 'API 内存告警', serverId: 's2', metric: 'mem', threshold: 90, consecutive: 2, enabled: true, createdAt: now - 86400000 * 4 },
    { id: 'r3', name: 'DB 离线检测', serverId: 's3', metric: 'offline', threshold: 0, consecutive: 1, enabled: true, createdAt: now - 86400000 * 2 },
  ];

  const events = [
    { id: 'e1', ruleId: 'r1', serverId: 's1', serverName: 'AWS 东京-Web-01', metric: 'cpu', value: 91.2, threshold: 85, message: 'AWS 东京-Web-01 CPU 使用率 达到 91.2%（阈值 85%）', at: now - 600000, acknowledged: false },
    { id: 'e2', ruleId: 'r3', serverId: 's3', serverName: 'AWS 新加坡-DB', metric: 'offline', value: 0, threshold: 0, message: 'AWS 新加坡-DB 已离线', at: now - 3600000, acknowledged: false },
    { id: 'e3', ruleId: 'r2', serverId: 's2', serverName: '阿里云-杭州-API', metric: 'mem', value: 92.4, threshold: 90, message: '阿里云-杭州-API 内存使用率 达到 92.4%（阈值 90%）', at: now - 7200000, acknowledged: true },
  ];

  const ok = (data) => Promise.resolve({ ok: true, data });

  window.nebula = {
    servers: {
      list: () => ok(servers),
      get: (id) => ok(servers.find((s) => s.id === id)),
      create: () => ok(servers[0]),
      update: () => ok(servers[0]),
      remove: () => ok(undefined),
      secretFlags: () => ok({ hasPassword: true, hasPrivateKey: false, hasPassphrase: false }),
      probe: () => ok({ latencyMs: 33, os: 'Ubuntu 22.04.4 LTS' }),
      testDraft: () => ok({ latencyMs: 28 }),
    },
    terminal: {
      open: () => new Promise(() => {}),
      write: () => ok(undefined),
      resize: () => ok(undefined),
      close: () => ok(undefined),
      list: () => ok([]),
    },
    files: {
      home: () => ok('/home/ubuntu'),
      list: (sid, p) => ok([
        { name: 'app', path: p + '/app', size: 4096, isDir: true, isSymlink: false, mode: 'drwxr-xr-x', mtime: now - 3600000 },
        { name: 'logs', path: p + '/logs', size: 4096, isDir: true, isSymlink: false, mode: 'drwxr-xr-x', mtime: now - 7200000 },
        { name: '.bashrc', path: p + '/.bashrc', size: 3771, isDir: false, isSymlink: false, mode: '-rw-r--r--', mtime: now - 86400000 * 3 },
        { name: 'docker-compose.yml', path: p + '/docker-compose.yml', size: 1284, isDir: false, isSymlink: false, mode: '-rw-r--r--', mtime: now - 86400000 },
        { name: 'deploy.sh', path: p + '/deploy.sh', size: 642, isDir: false, isSymlink: false, mode: '-rwxr-xr-x', mtime: now - 43200000 },
        { name: 'nginx.conf', path: p + '/nginx.conf', size: 2960, isDir: false, isSymlink: false, mode: '-rw-r--r--', mtime: now - 9000000 },
      ]),
      remove: () => ok(undefined),
      mkdir: () => ok(undefined),
      read: () => ok('# mock file content\nserver {\n    listen 80;\n}\n'),
      write: () => ok(undefined),
      upload: () => ok(undefined),
      download: () => ok(undefined),
    },
    batch: {
      exec: (ids, cmd) => ok(ids.map((id) => {
        const s = servers.find((x) => x.id === id);
        return {
          serverId: id, serverName: s ? s.name : id, ok: true, code: 0,
          stdout: 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/nvme0n1p1   64G   39G   25G  61% /\n/dev/nvme1n1    100G   12G   88G  12% /data',
          stderr: '', durationMs: 400 + Math.floor(Math.random() * 600),
        };
      })),
    },
    metrics: {
      get: (id) => ok(series[id] || []),
      sampleNow: (id) => ok(series[id][90]),
      rules: () => ok(rules),
      upsertRule: (r) => ok(r),
      deleteRule: () => ok(undefined),
      events: () => ok(events),
      ackEvent: () => ok(undefined),
      clearEvents: () => ok(undefined),
    },
    cloud: {
      accounts: () => ok(accounts),
      addAccount: () => ok({ id: 'a3' }),
      deleteAccount: () => ok(undefined),
      verify: () => ok('AWS 账号 123456789012'),
      listInstances: (id) => ok(instances[id] || []),
      power: () => ok(undefined),
      import: () => ok(servers[0]),
    },
    app: {
      info: () => ok({
        userDataPath: 'C:\\Users\\Linyizhi\\AppData\\Roaming\\nebula-console',
        serverCount: 4, accountCount: 2, secretCount: 4,
        versions: { electron: '33.4.11', node: '20.18.1', chrome: '130.0.6723.152' },
      }),
      openPath: () => ok(''),
      showItemInFolder: () => ok(undefined),
    },
    on: () => () => {},
  };
}

(async () => {
  await new Promise((r) => server.listen(5399, r));
  // 用系统已装的 Edge/Chrome，避免额外下载 Playwright 自带浏览器
  const CANDIDATES = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  const executablePath = CANDIDATES.find((p) => fs.existsSync(p));
  if (!executablePath) throw new Error('找不到可用的 Chromium 内核浏览器');
  console.log('using browser:', executablePath);
  const browser = await chromium.launch({ executablePath, args: ['--disable-gpu'] });
  const page = await browser.newPage({
    viewport: { width: 1480, height: 920 },
    deviceScaleFactor: 1,
  });

  page.on('console', (m) => {
    if (m.type() === 'error') console.log('[page error]', m.text());
  });
  page.on('pageerror', (e) => console.log('[page exception]', e.message));

  await page.addInitScript(mockScript);
  await page.goto('http://localhost:5399/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);

  const shots = [
    ['01-dashboard', null],
    ['02-servers', '服务器'],
    ['03-terminal', '终端'],
    ['04-cloud', '云资源'],
    ['05-monitor', '监控'],
    ['06-batch', '批量运维'],
    ['07-alerts', '告警'],
    ['08-settings', '设置'],
  ];

  for (const [name, navLabel] of shots) {
    if (navLabel) {
      await page.click(`button:has-text("${navLabel}")`);
      await page.waitForTimeout(1200);
    }
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log('captured', name);
  }

  // 服务器详情页：点列表第一行
  await page.click('button:has-text("服务器")');
  await page.waitForTimeout(700);
  await page.click('tbody tr:first-child');
  await page.waitForTimeout(1600);
  await page.screenshot({ path: path.join(OUT, '09-server-detail.png') });
  console.log('captured 09-server-detail');

  // 详情页的监控 tab —— 注意必须限定在详情页 tab 容器内，
  // 否则 button:has-text("监控") 会先匹配到左侧导航栏，直接跳走离开详情页。
  const tabBar = page.locator('[data-detail-tabs]');
  await tabBar.locator('button', { hasText: '监控' }).click();
  await page.waitForTimeout(1600);
  await page.screenshot({ path: path.join(OUT, '10-detail-monitor.png') });
  console.log('captured 10-detail-monitor');

  // 文件 tab
  await tabBar.locator('button', { hasText: '文件' }).click();
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(OUT, '11-detail-files.png') });
  console.log('captured 11-detail-files');

  await browser.close();
  server.close();
  process.exit(0);
})().catch((e) => {
  console.error('FAILED', e);
  process.exit(1);
});
