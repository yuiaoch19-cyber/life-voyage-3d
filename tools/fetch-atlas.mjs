// 从 ashemag/human-atlas 下载 BodyParts3D 分块模型 + 元数据到 public/models/atlas-src/
// raw.githubusercontent.com 在本机不可达，统一走 api.github.com Contents API(raw)。
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = 'ashemag/human-atlas';
const DIR = 'public/models';
const OUT = 'public/models/atlas-src';
const API = `https://api.github.com/repos/${REPO}/contents/${DIR}?ref=main`;

async function dl(name, size) {
  const url = `https://api.github.com/repos/${REPO}/contents/${DIR}/${encodeURIComponent(name)}?ref=main`;
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github.raw', 'User-Agent': 'life-voyage-3d' } });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const ab = await res.arrayBuffer();
  if (ab.byteLength !== size) throw new Error(`${name}: size mismatch got ${ab.byteLength} expect ${size}`);
  writeFileSync(join(OUT, name), Buffer.from(ab));
  console.log(`ok ${name} ${(ab.byteLength / 1048576).toFixed(1)}MB`);
}

const listing = await (await fetch(API, { headers: { 'User-Agent': 'life-voyage-3d' } })).json();
const files = listing.filter((f) => f.type === 'file');
mkdirSync(OUT, { recursive: true });
for (const f of files) {
  for (let i = 0; i < 3; i++) {
    try { await dl(f.name, f.size); break; }
    catch (e) { console.error(`retry ${i + 1} ${f.name}: ${e.message}`); if (i === 2) process.exitCode = 1; }
  }
}
console.log('done');
