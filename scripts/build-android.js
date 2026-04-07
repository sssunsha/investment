const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist/investment-assistant/browser');
const CORDOVA_DIR = path.join(ROOT, 'cordova-app');
const CORDOVA_WWW = path.join(CORDOVA_DIR, 'www');

// 同步版本号到 cordova-app/config.xml
function syncVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const configPath = path.join(CORDOVA_DIR, 'config.xml');
  let xml = fs.readFileSync(configPath, 'utf8');
  xml = xml.replace(/version="[\d.]+"/, `version="${pkg.version}"`);
  fs.writeFileSync(configPath, xml);
  console.log(`✓ 版本同步: ${pkg.version}`);
  return pkg.version;
}

// 递归复制目录
function copyDir(src, dest) {
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyDir(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

// 将 Angular 构建产物复制到 cordova www
function copyToCordova() {
  if (!fs.existsSync(DIST_DIR)) {
    throw new Error(`构建产物不存在: ${DIST_DIR}\n请先执行 npm run build`);
  }
  if (fs.existsSync(CORDOVA_WWW)) {
    fs.rmSync(CORDOVA_WWW, { recursive: true, force: true });
  }
  fs.mkdirSync(CORDOVA_WWW, { recursive: true });
  copyDir(DIST_DIR, CORDOVA_WWW);
  console.log('✓ 构建文件已复制到 cordova-app/www');
}

// 构建 Android APK
function buildAndroid(buildType = 'debug') {
  const flag = buildType === 'release' ? '--release' : '';
  console.log(`\n构建 Android ${buildType} APK...`);
  execSync(`npx cordova build android ${flag}`.trim(), { cwd: CORDOVA_DIR, stdio: 'inherit' });
  const apkDir = `cordova-app/platforms/android/app/build/outputs/apk/${buildType}/`;
  console.log(`\n✓ APK 构建成功！\n位置: ${apkDir}`);
}

// 主流程
function main() {
  const buildType = process.argv[2] || 'debug';
  console.log(`\n开始 Android ${buildType} 构建流程...\n`);

  try {
    console.log('步骤 1: 构建 Angular 项目...');
    execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });

    console.log('\n步骤 2: 同步版本号...');
    syncVersion();

    console.log('\n步骤 3: 复制构建文件到 Cordova...');
    copyToCordova();

    console.log('\n步骤 4: 构建 Android APK...');
    buildAndroid(buildType);

    console.log('\n✓ Android 构建完成！');
  } catch (err) {
    console.error('\n✗ 构建失败:', err.message);
    process.exit(1);
  }
}

main();
