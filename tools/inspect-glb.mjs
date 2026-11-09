// GLB 结构检查器：解析 JSON chunk，列出节点/网格名称与包围盒。
// 用法: node tools/inspect-glb.mjs <path-to.glb> [--all]
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const showAll = process.argv.includes('--all');
if (!file) {
  console.error('usage: node tools/inspect-glb.mjs <path-to.glb> [--all]');
  process.exit(1);
}

const buf = readFileSync(file);
const magic = buf.toString('ascii', 0, 4);
if (magic !== 'glTF') {
  console.error('not a GLB file');
  process.exit(1);
}
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));

const accessors = json.accessors ?? [];
const meshes = json.meshes ?? [];
const nodes = json.nodes ?? [];

// 全场景近似范围：取所有 mesh POSITION accessor 的 min/max 并集
let gmin = [Infinity, Infinity, Infinity];
let gmax = [-Infinity, -Infinity, -Infinity];
let tris = 0;

for (const mesh of meshes) {
  for (const prim of mesh.primitives ?? []) {
    const acc = accessors[prim.attributes?.POSITION];
    if (!acc) continue;
    if (acc.min && acc.max) {
      for (let i = 0; i < 3; i++) {
        gmin[i] = Math.min(gmin[i], acc.min[i]);
        gmax[i] = Math.max(gmax[i], acc.max[i]);
      }
    }
    tris += (acc.count ?? 0) / 3;
  }
}
console.log(`== 场景概要 ==`);
console.log(`nodes=${nodes.length} meshes=${meshes.length} materials=${(json.materials ?? []).length}`);
console.log(`triangles≈${Math.round(tris).toLocaleString()}`);
console.log(`bounds min=[${gmin.map((v) => v.toFixed(2)).join(', ')}] max=[${gmax.map((v) => v.toFixed(2)).join(', ')}]`);

// 每个网格：名称、图元数、局部包围盒中心
function meshInfo(m, idx) {
  let lo = [Infinity, Infinity, Infinity];
  let hi = [-Infinity, -Infinity, -Infinity];
  let n = 0;
  for (const prim of m.primitives ?? []) {
    const acc = accessors[prim.attributes?.POSITION];
    if (!acc) continue;
    n += (acc.count ?? 0) / 3;
    if (acc.min && acc.max) {
      for (let i = 0; i < 3; i++) {
        lo[i] = Math.min(lo[i], acc.min[i]);
        hi[i] = Math.max(hi[i], acc.max[i]);
      }
    }
  }
  const c = lo.map((v, i) => ((v + hi[i]) / 2).toFixed(2)).join(', ');
  return { name: m.name ?? `#${idx}`, prims: m.primitives?.length ?? 0, tris: Math.round(n), center: `[${c}]` };
}

console.log(`\n== 网格列表（${showAll ? '全部' : '名称含器官关键词的加 *'}）==`);
const organKeys = /(cor|pulmo|lung|hepar|liver|gaster|stomach|intestin|ren|kidney|cerebr|encephalon|brain|vesica|bladder|splen|spleen|pancreas|thyroid|trachea|esophag|heart|heart_l|organ|viscer)/i;
for (let i = 0; i < meshes.length; i++) {
  const info = meshInfo(meshes[i], i);
  const hit = organKeys.test(info.name);
  const tag = hit ? '  <<ORGAN?' : '';
  if (showAll || hit || i < 30) {
    console.log(`${String(i).padStart(3)} ${info.name.padEnd(42)} prims=${String(info.prims).padEnd(3)} tris=${String(info.tris).padStart(7)} c=${info.center}${tag}`);
  }
}

// 节点级 extras（Z-Anatomy 元数据可能在 node.extras / mesh.extras）
const exNode = nodes.filter((n) => n.extras && Object.keys(n.extras).length).length;
const exMesh = meshes.filter((m) => m.extras && Object.keys(m.extras).length).length;
console.log(`\n== extras == nodes with extras: ${exNode}, meshes with extras: ${exMesh}`);
const sample = nodes.find((n) => n.extras && Object.keys(n.extras).length);
if (sample) console.log('sample node extras:', JSON.stringify(sample.extras).slice(0, 300));
const sampleM = meshes.find((m) => m.extras && Object.keys(m.extras).length);
if (sampleM) console.log('sample mesh extras:', JSON.stringify(sampleM.extras).slice(0, 300));

if (showAll) {
  console.log(`\n== 节点名（前 80）==`);
  nodes.slice(0, 80).forEach((n, i) => console.log(`${i}: ${n.name ?? '-'} mesh=${n.mesh ?? '-'}`));
}
