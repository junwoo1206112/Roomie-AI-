import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const publicFiles = ['index.html', 'style.css', 'script.js', 'analysis-engine.js', 'layout-engine.js', 'file-validation.js', 'favicon.svg'];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of publicFiles) {
  const source = path.join(root, file);
  const info = await stat(source);
  if (!info.isFile()) throw new Error(`배포 파일이 아닙니다: ${file}`);
  await copyFile(source, path.join(output, file));
}

console.log(`dist 생성 완료: ${publicFiles.length}개 파일`);
