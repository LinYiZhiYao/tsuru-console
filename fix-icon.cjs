/**
 * 给打包后的 exe 写入应用图标与版本信息。
 *
 * 为什么需要它：为了避免 winCodeSign 工具包在无管理员权限的 Windows 上解压失败
 * （包里带 macOS 符号链接），本项目 win.signAndEditExecutable 设为 false。
 * 但 electron-builder 在 signAndEditExecutable === false 时会整个跳过
 * signAndEditResources()，连 rcedit 都不跑，导致 exe 里留的是 Electron 默认图标。
 *
 * 注意：不能走 `app-builder.exe rcedit` 子命令 —— 它内部仍会 DownloadWinCodeSign，
 * 在无管理员权限的 Windows 上会因 macOS 符号链接解压失败而卡死。
 * 这里直接调用 winCodeSign 包里的独立工具 tools/rcedit-x64.exe（v0.2.0），
 * 它就是 electron-builder 实际用来改资源的那个程序，完全离线。
 *
 * 用法：
 *   node fix-icon.cjs [exe路径]        # 默认 release-app2/win-unpacked/Nebula Console.exe
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const pkg = require('./package.json');
const outDir = (pkg.build && pkg.build.directories && pkg.build.directories.output) || 'release-app2';
const prodName = (pkg.build && pkg.build.productName) || 'Tsuru Console';
const exe =
  process.argv[2] ||
  [
    path.join(ROOT, outDir, 'win-unpacked', `${prodName}.exe`),
    path.join(ROOT, outDir, 'win-unpacked', 'Tsuru Console.exe'),
    path.join(ROOT, outDir, 'win-unpacked', 'Nebula Console.exe'),
  ].find((p) => fs.existsSync(p)) ||
  path.join(ROOT, outDir, 'win-unpacked', `${prodName}.exe`);
const ico = path.join(ROOT, 'build', 'icon.ico');
const rcedit = path.join(ROOT, 'tools', 'rcedit-x64.exe');

for (const [label, p] of [['exe', exe], ['ico', ico], ['rcedit', rcedit]]) {
  if (!fs.existsSync(p)) throw new Error(`找不到 ${label}: ${p}`);
}

// 先备份，图标写入是可逆的，但 exe 资源被改坏时不至于无路可退
const bak = `${exe}.bak`;
if (!fs.existsSync(bak)) {
  fs.copyFileSync(exe, bak);
  console.log('backup:', bak);
}

const args = [
  exe,
  '--set-version-string', 'FileDescription', pkg.description || pkg.productName,
  '--set-version-string', 'ProductName', pkg.productName || 'Nebula Console',
  '--set-file-version', pkg.version,
  '--set-product-version', pkg.version,
  '--set-icon', ico,
];

console.log('rcedit args:', JSON.stringify(args));
const r = spawnSync(rcedit, args, {
  cwd: ROOT,
  encoding: 'utf8',
  env: { ...process.env, NODE_OPTIONS: '', PYTHONPATH: '' },
});
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
if (r.status !== 0) {
  console.error(`rcedit 失败，exit=${r.status} error=${r.error && r.error.message}`);
  process.exit(r.status || 1);
}
console.log('OK: exe 图标与版本信息已写入');
