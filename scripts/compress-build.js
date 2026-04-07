const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');

const brotliCompress = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

const DIST_DIR = path.resolve(__dirname, '../dist/investment-assistant/browser');
const COMPRESSIBLE = ['.js', '.css', '.html', '.svg', '.json', '.xml', '.txt'];
const MIN_SIZE = 10240; // 只压缩 > 10KB 的文件

async function compressFile(filePath) {
  if (!COMPRESSIBLE.includes(path.extname(filePath))) return;
  const content = fs.readFileSync(filePath);
  if (content.length < MIN_SIZE) return;

  try {
    const br = await brotliCompress(content, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
    });
    if (br.length < content.length * 0.8) {
      fs.writeFileSync(`${filePath}.br`, br);
      console.log(`✓ Brotli: ${path.basename(filePath)} (${content.length} → ${br.length} bytes)`);
    }

    const gz = await gzip(content, { level: 9 });
    if (gz.length < content.length * 0.8) {
      fs.writeFileSync(`${filePath}.gz`, gz);
      console.log(`✓ Gzip:   ${path.basename(filePath)} (${content.length} → ${gz.length} bytes)`);
    }
  } catch (err) {
    console.error(`压缩失败 ${filePath}:`, err.message);
  }
}

async function compressDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await compressDir(full);
    else await compressFile(full);
  }
}

async function main() {
  if (!fs.existsSync(DIST_DIR)) {
    console.error(`构建目录不存在: ${DIST_DIR}`);
    process.exit(1);
  }
  console.log('开始压缩构建产物...');
  await compressDir(DIST_DIR);
  console.log('✓ 压缩完成！');
}

main().catch((err) => {
  console.error('压缩失败:', err);
  process.exit(1);
});
