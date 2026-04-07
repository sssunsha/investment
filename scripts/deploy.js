const { execSync } = require('child_process');

// 格式化当前日期时间：2026-04-07 09:30:00
function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  );
}

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', ...opts });
}

function main() {
  // 步骤 1：构建
  console.log('步骤 1: 构建项目...');
  run('npm run build');
  console.log('✓ 构建成功\n');

  // 步骤 2：检查是否有待提交的变更
  const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
  if (!status) {
    console.log('✓ 没有需要提交的变更，跳过 commit。');
    return;
  }

  // 步骤 3：提交
  const message = getTimestamp();
  console.log(`步骤 2: 提交所有变更，commit message: "${message}"`);
  run('git add -A');
  run(`git commit -m "${message}"`);
  console.log(`\n✓ Commit 完成: ${message}`);
}

main();
