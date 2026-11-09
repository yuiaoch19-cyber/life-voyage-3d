// build-organs.mjs — 组装 organs.glb（器官总装）
//
// 数据源与坐标（全部 Y 上、+Z 前、米制、脚底 y≈0）：
//  A. body.glb        Z-Anatomy 肌骨体格（hpfrei 简化）——【目标空间】
//  B. authorOd 容器   Z-Anatomy 标准版分块（心/肺/肝/胃/端脑）——近原生同空间，k_za 微缩放
//  C. atlas-src       BodyParts3D 4.0 自定义 bin（肠/脾/胰/肾/膀胱/气管/食管/皮肤…）——k_bp3d 缩放
// 输出:
//  public/models/organs.glb     节点名 o.<organId>（合并件）
//  tools/tmp/anchors.json       各器官世界包围盒 + 关键动脉锚点（供血管曲线与机位设计）
//
// 运行: node tools/build-organs.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const ROOT = process.cwd();
const P = (s) => join(ROOT, s);
const ZA = 'tools/tmp';
const log = (...a) => console.log(...a);

/* ---------- 小型 mat4 工具（避免依赖差异，自实现） ---------- */
function m4mul(a, b) { // a*b（列主序，与 glTF/three 一致）
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
function m4apply(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}
function m4scale(s) { return new Float32Array([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]); }
const scaleArr = (arr, k) => { const o = new Float32Array(arr.length); for (let i = 0; i < arr.length; i++) o[i] = arr[i] * k; return o; };


await MeshoptEncoder.ready;
async function writeCompressed(path, doc) {
  doc.createExtension(EXTMeshoptCompression).setRequired(true);
  const ioOut = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'draco3d.decoder': dracoDecoder, 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  await ioOut.write(path, doc);
}

/* ---------- gltf-transform IO ---------- */
const dracoDecoder = await draco3d.createDecoderModule();
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'draco3d.decoder': dracoDecoder, 'meshopt.decoder': MeshoptDecoder });

/* ---------- A. body.glb 真实世界包围盒（含节点变换） ---------- */
async function bodyBounds() {
  const doc = await io.read(P('public/models/body.glb'));
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const M = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'); if (!pos) continue;
      const mnL = pos.getMin([]), mxL = pos.getMax([]); if (!mnL || !mxL) continue;
      for (const cx of [mnL[0], mxL[0]]) for (const cy of [mnL[1], mxL[1]]) for (const cz of [mnL[2], mxL[2]]) {
        const w = m4apply(M, cx, cy, cz);
        for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], w[i]); mx[i] = Math.max(mx[i], w[i]); }
      }
    }
  }
  return { mn, mx, h: mx[1] - mn[1] };
}

/* ---------- B. Z-Anatomy 容器解码 ---------- */
// 容器 = 1 节点 1 网格：position(量化 i16/u16 normalized) + normal + _id(u16 本地网格号) + index
// node.extras = { meshStart, meshCount }；全局网格号 = meshStart + 本地 _id
async function decodeZA(path) {
  const doc = await io.read(P(path));
  const node = doc.getRoot().listNodes().find((n) => n.getMesh());
  if (!node) throw new Error(`${path}: no mesh node`);
  const extras = node.getExtras();
  const meshStart = extras.meshStart;
  const prim = node.getMesh().listPrimitives()[0];
  const posAcc = prim.getAttribute('POSITION');
  const nrmAcc = prim.getAttribute('NORMAL');
  const idAcc = prim.getAttribute('_ID') ?? prim.getAttribute('_id');
  const idxAcc = prim.getIndices();
  const M = node.getWorldMatrix();

  const dequant = (acc) => {
    const arr = acc.getArray(); const norm = acc.getNormalized();
    let s = 1;
    if (norm) {
      if (arr instanceof Int16Array) s = 1 / 32767;
      else if (arr instanceof Uint16Array) s = 1 / 65535;
      else if (arr instanceof Int8Array) s = 1 / 127;
      else if (arr instanceof Uint8Array) s = 1 / 255;
    }
    return { arr, s };
  };
  const pos = dequant(posAcc), nrm = dequant(nrmAcc);
  const ids = idAcc.getArray();
  const idx = idxAcc ? idxAcc.getArray() : null;
  const vCount = posAcc.getCount();

  // 逐顶点世界坐标/法线（懒变换，按需）
  const wpos = new Float32Array(vCount * 3);
  const wnrm = new Float32Array(vCount * 3);
  for (let i = 0; i < vCount; i++) {
    const x = pos.arr[i * posAcc.getElementSize()] * pos.s;
    const y = pos.arr[i * posAcc.getElementSize() + 1] * pos.s;
    const z = pos.arr[i * posAcc.getElementSize() + 2] * pos.s;
    const w = m4apply(M, x, y, z);
    wpos[i * 3] = w[0]; wpos[i * 3 + 1] = w[1]; wpos[i * 3 + 2] = w[2];
    let nx = nrm.arr[i * nrmAcc.getElementSize()] * nrm.s;
    let ny = nrm.arr[i * nrmAcc.getElementSize() + 1] * nrm.s;
    let nz = nrm.arr[i * nrmAcc.getElementSize() + 2] * nrm.s;
    const l = Math.hypot(nx, ny, nz) || 1;
    wnrm[i * 3] = nx / l; wnrm[i * 3 + 1] = ny / l; wnrm[i * 3 + 2] = nz / l;
  }
  // 按本地 _id 分组三角形（实测 _ID comp0 存的就是全局网格号，无需再加 meshStart）
  const triById = new Map(); // globalId -> [i0,i1,i2,...]
  const tCount = idx ? idx.length / 3 : vCount / 3;
  const idStride = idAcc.getElementSize();
  for (let t = 0; t < tCount; t++) {
    const a = idx ? idx[t * 3] : t * 3, b = idx ? idx[t * 3 + 1] : t * 3 + 1, c = idx ? idx[t * 3 + 2] : t * 3 + 2;
    const id = ids[a * idStride];
    let list = triById.get(id); if (!list) { list = []; triById.set(id, list); }
    list.push(a, b, c);
  }
  const out = new Map(); // globalMeshId -> {pos, nrm, idx}
  for (const [localId, tris] of triById) {
    const used = new Set(tris);
    const remap = new Map(); const np = []; const nn = []; const ni = [];
    for (let t = 0; t < tris.length; t++) {
      const v = tris[t];
      let ni2 = remap.get(v);
      if (ni2 === undefined) {
        ni2 = np.length / 3; remap.set(v, ni2);
        np.push(wpos[v * 3], wpos[v * 3 + 1], wpos[v * 3 + 2]);
        nn.push(wnrm[v * 3], wnrm[v * 3 + 1], wnrm[v * 3 + 2]);
      }
      ni.push(ni2);
    }
    out.set(localId, { pos: np, nrm: nn, idx: ni });
  }
  log(`  ZA ${path.split('/').pop()}: ${vCount} 顶点, ${tCount} 三角, ${out.size} 子网格 (meshStart=${meshStart})`);
  return out;
}

/* ---------- C. BodyParts3D bin 读取 ---------- */
// 布局: positions(f32 v*3) → normals(i16 v*3) → pad4 → indices(u32 ic)
function readBP3DPart(atlas, part) {
  const binPath = P(`public/models/atlas-src/body-${part.chunk}.bin`);
  const buf = readFileSync(binPath);
  const v = part.vertexCount, ic = part.indexCount;
  const posOff = part.positions, nrmOff = part.normals, idxOff = part.indices;
  const pos = new Float32Array(v * 3);
  for (let i = 0; i < v * 3; i++) pos[i] = buf.readFloatLE(posOff + i * 4);
  const nrm = new Float32Array(v * 3);
  for (let i = 0; i < v * 3; i++) nrm[i] = buf.readInt16LE(nrmOff + i * 2) / 32767;
  const idx = new Uint32Array(ic);
  for (let i = 0; i < ic; i++) idx[i] = buf.readUInt32LE(idxOff + i * 4);
  return { pos, nrm, idx };
}

/* ---------- 组装 ---------- */
const body = await bodyBounds();
const H = body.h;
log(`body.glb 世界包围盒: min=[${body.mn.map((v) => v.toFixed(3))}] max=[${body.mx.map((v) => v.toFixed(3))}] h=${H.toFixed(4)}`);
const K_ZA = H / 1.743723;   // Z-Anatomy manifest bounds 高
const K_BP = H / 1.730000;   // BodyParts3D 全局 bounds 高
log(`缩放系数: K_ZA=${K_ZA.toFixed(5)}  K_BP=${K_BP.toFixed(5)}`);

const manifest = JSON.parse(readFileSync(P(`${ZA}/za-manifest.json`), 'utf8'));
const kids = {}; for (const s of manifest.structures) (kids[s.parent] ??= []).push(s);
const collect = (id, acc = []) => { for (const k of kids[id] ?? []) { if (k.meshes) acc.push(k); collect(k.id, acc); } return acc; };

// 下载在手的 ZA 分块 → 全局网格号表
const zaFiles = [
  'za-cardiovascular_arterial_system.glb', 'za-visceral_endocrine_glands--respiratory_system.glb',
  'za-visceral_digestive_system.glb', 'za-nervous_brain.glb', 'za-nervous_telencephalon.glb',
  'za-nervous_telencephalon.2.glb', 'za-nervous_white_matter_of_telencephalon_l.glb',
  'za-visceral_urinary_system.glb',
  'za-nervous_spinal_cord--autonomic_division_of_peripheral_nervous.glb',
  'za-nervous_spinal_nerves.glb', 'za-nervous_peripheral_nervous_system.glb',
  'za-nervous_central_nervous_system.glb',
];
const zaMeshes = new Map(); // globalMeshId -> {pos,nrm,idx}
for (const f of zaFiles) { if (!existsSync(P(`${ZA}/${f}`))) { log(`!! 缺文件 ${f}`); continue; } const m = await decodeZA(`${ZA}/${f}`); for (const [k, v] of m) zaMeshes.set(k, v); }

// ZA 器官选择：organId -> 结构 id / 过滤器
const zaWants = [
  ['heart', (s) => collect('cardiovascular.heart')],
  ['lungs', (s) => [...collect('visceral.left_lung'), ...collect('visceral.right_lung')]],
  ['liver', (s) => m2(structure('visceral.liver'))],
  ['stomach', (s) => m2(structure('visceral.stomach'))],
  ['brain', (s) => collect('nervous.brain').filter((x) => /cerebr|cerebell|medulla|pons|midbrain|telencephalon|thalamus|hypothalamus|brainstem/i.test(x.id))],
  ['kidneys', (s) => collect('visceral.urinary_system').filter((x) => /kidney/i.test(x.id))],
  ['nerves', (s) => [...collect('nervous.spinal_cord'), ...collect('nervous.spinal_nerves'), ...collect('nervous.peripheral_nervous_system')].filter((x) => x.meshes)],
  ['ureters-bladder', (s) => collect('visceral.urinary_system').filter((x) => /ureter|bladder|urethra/i.test(x.id))],
];
function structure(id) { return manifest.structures.find((x) => x.id === id); }
function m2(s) { return s && s.meshes ? [s] : []; }

/** 合并一组 {pos,nrm,idx}（同一坐标系，统一再乘 k） */
function merge(parts, k, flip = false) {
  let nv = 0, ni = 0;
  for (const p of parts) { nv += p.pos.length / 3; ni += p.idx.length; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  let vo = 0, io2 = 0;
  for (const p of parts) {
    for (let i = 0; i < p.pos.length; i++) pos[vo * 3 + i] = p.pos[i] * k;
    for (let i = 0; i < p.nrm.length; i++) nrm[vo * 3 + i] = p.nrm[i];
    for (let i = 0; i < p.idx.length; i++) idx[io2 + i] = p.idx[i] + vo;
    vo += p.pos.length / 3; io2 += p.idx.length;
  }
  return { pos, nrm, idx };
}

const organs = new Map(); // organId -> parts[]
const zaMiss = [];
for (const [organId, fn] of zaWants) {
  const list = fn();
  const parts = [];
  for (const s of list) for (const mid of s.meshes) {
    const g = zaMeshes.get(mid);
    if (g) parts.push(g); else zaMiss.push(`${organId}:${s.id}#${mid}`);
  }
  if (parts.length) organs.set(organId, parts);
  log(`ZA ${organId}: ${list.length} 结构, ${parts.length} 子网格`);
}
if (zaMiss.length) log('!! ZA 未命中(不在已下载分块):', [...new Set(zaMiss)].slice(0, 8).join(' | '), zaMiss.length > 8 ? `… 共${zaMiss.length}` : '');

// BP3D 器官选择
const atlas = JSON.parse(readFileSync(P('public/models/atlas-src/atlas.json'), 'utf8'));
const byId = new Map(atlas.parts.map((p) => [p.id, p]));
const bpSel = [
  ['esophagus', ['FJ2563']],
  ['small-intestine', atlas.parts.filter((p) => /part of (ileum|jejunum)$/.test(p.name)).map((p) => p.id)],
  ['large-intestine', ['FJ2566', 'FJ2572', 'FJ2567', 'FJ2571', 'FJ2565']],
  ['spleen', ['FJ2561']],
  ['pancreas', ['FJ1895']],
  ['gallbladder', ['FJ2817']],
  ['trachea-bronchi', ['FJ2541', 'FJ2450', 'FJ2539']],
  ['thymus', ['FJ3150', 'FJ3151']],
  ['diaphragm', ['FJ3131']],
  ['skin', ['FJ2810']],
];
const anchors = { organs: {}, arteries: {} };
for (const [organId, ids] of bpSel) {
  const parts = [];
  for (const id of ids) {
    const p = byId.get(id); if (!p) { log(`!! BP3D 缺件 ${id}`); continue; }
    const g = readBP3DPart(atlas, p);
    parts.push(g);
  }
  if (!parts.length) continue;
  // 合并并缩放到 body 空间
  const raw = merge(parts, 1);
  const scaled = { pos: scaleArr(raw.pos, K_BP), nrm: raw.nrm, idx: raw.idx };
  organs.set(organId, [scaled]);
  log(`BP3D ${organId}: ${ids.length} 件, ${(scaled.pos.length / 3).toLocaleString()} 顶点`);
}

// 关键动脉锚点（BP3D 世界坐标 × K_BP，用于血管曲线设计）
const arteryNames = /aorta|pulmonary (trunk|artery|veins?)|coronary artery|carotid artery|subclavian artery|brachiocephalic (trunk|artery)|vena cava/i;
for (const p of atlas.parts) {
  if (!arteryNames.test(p.name)) continue;
  const c = [(p.bounds[0][0] + p.bounds[1][0]) / 2 * K_BP, (p.bounds[0][1] + p.bounds[1][1]) / 2 * K_BP, (p.bounds[0][2] + p.bounds[1][2]) / 2 * K_BP];
  const key = `${p.name} #${p.id}`;
  anchors.arteries[key] = { center: c.map((v) => +v.toFixed(4)), min: p.bounds[0].map((v) => +(v * K_BP).toFixed(4)), max: p.bounds[1].map((v) => +(v * K_BP).toFixed(4)) };
}

// 血管树：arterial + venous 真实部件（按三角预算截断），输出独立 vasculature.glb
const VASC_BUDGET = 320000;
const vascSel = { arterial: [], venous: [] };
let vascTris = 0;
const vascCand = atlas.parts
  .filter((p) => p.system === 'arterial' || p.system === 'venous')
  .sort((a, b) => b.vertexCount - a.vertexCount);
for (const p of vascCand) {
  const t = p.indexCount / 3;
  if (vascTris + t > VASC_BUDGET) continue;
  vascSel[p.system].push(p);
  vascTris += t;
}
log(`血管树: arterial ${vascSel.arterial.length} 件, venous ${vascSel.venous.length} 件, 共 ${Math.round(vascTris).toLocaleString()} 三角`);

// 中心线提取器（血管与神经共用）：PCA 主轴 + 分箱平均
const HEART = [0.022, 1.258, 0.076];
const BRAIN = [0, 1.55, 0.02];
const centerline = (g, n = 12, name) => {
  const vc = g.pos.length / 3;
  if (!vc) return [];
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < vc; i++) { cx += g.pos[i * 3]; cy += g.pos[i * 3 + 1]; cz += g.pos[i * 3 + 2]; }
  cx /= vc; cy /= vc; cz /= vc;
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (let i = 0; i < vc; i++) {
    const x = g.pos[i * 3] - cx, y = g.pos[i * 3 + 1] - cy, z = g.pos[i * 3 + 2] - cz;
    xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z;
  }
  const mul = (v) => [xx * v[0] + xy * v[1] + xz * v[2], xy * v[0] + yy * v[1] + yz * v[2], xz * v[0] + yz * v[1] + zz * v[2]];
  let axis = [0.3, 0.9, 0.2];
  for (let it = 0; it < 24; it++) { const w = mul(axis); const l = Math.hypot(w[0], w[1], w[2]) || 1; axis = [w[0] / l, w[1] / l, w[2] / l]; }
  let mn = Infinity, mx = -Infinity;
  const t = new Float32Array(vc);
  for (let i = 0; i < vc; i++) { const p = g.pos[i * 3] * axis[0] + g.pos[i * 3 + 1] * axis[1] + g.pos[i * 3 + 2] * axis[2]; if (!isFinite(p)) return []; t[i] = p; if (p < mn) mn = p; if (p > mx) mx = p; }
  if (!isFinite(mn) || !isFinite(mx) || mx <= mn) return [];
  const bins = Array.from({ length: n }, () => [0, 0, 0, 0]);
  for (let i = 0; i < vc; i++) {
    let b = Math.floor(((t[i] - mn) / (mx - mn + 1e-9)) * n);
    b = Math.max(0, Math.min(n - 1, b)); // Float32 舍入可能使 floor 越界一位
    bins[b][0] += g.pos[i * 3]; bins[b][1] += g.pos[i * 3 + 1]; bins[b][2] += g.pos[i * 3 + 2]; bins[b][3]++;
  }
  return bins.filter((b) => b[3] > 0).map((b) => [b[0] / b[3], b[1] / b[3], b[2] / b[3]]);
};
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const curveLen = (pts) => { let l = 0; for (let i = 1; i < pts.length; i++) l += dist3(pts[i - 1], pts[i]); return l; };

{
  // 全人体粒子流路径：从每根真实血管部件提取中心线（PCA 主轴 + 分箱平均）
  const HEART = [0.022, 1.258, 0.076];
  const HERO_HINT = /(aorta|carotid|coronary|vena cava|renal|pulmonary)/i; // 主干已由手写曲线覆盖
  const centerline = (g, n = 12, name) => {
    const vc = g.pos.length / 3;
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < vc; i++) { cx += g.pos[i * 3]; cy += g.pos[i * 3 + 1]; cz += g.pos[i * 3 + 2]; }
    cx /= vc; cy /= vc; cz /= vc;
    let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
    for (let i = 0; i < vc; i++) {
      const x = g.pos[i * 3] - cx, y = g.pos[i * 3 + 1] - cy, z = g.pos[i * 3 + 2] - cz;
      xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z;
    }
    const mul = (v) => [xx * v[0] + xy * v[1] + xz * v[2], xy * v[0] + yy * v[1] + yz * v[2], xz * v[0] + yz * v[1] + zz * v[2]];
    let axis = [0.3, 0.9, 0.2];
    for (let it = 0; it < 24; it++) { const w = mul(axis); const l = Math.hypot(w[0], w[1], w[2]) || 1; axis = [w[0] / l, w[1] / l, w[2] / l]; }
    let mn = Infinity, mx = -Infinity;
    const t = new Float32Array(vc);
    let nan = false;
    for (let i = 0; i < vc; i++) { const p = g.pos[i * 3] * axis[0] + g.pos[i * 3 + 1] * axis[1] + g.pos[i * 3 + 2] * axis[2]; if (!isFinite(p)) nan = true; t[i] = p; if (p < mn) mn = p; if (p > mx) mx = p; }
    if (nan || !isFinite(mn) || !isFinite(mx) || mx <= mn) { log(`!! 跳过含 NaN 的血管部件: ${name ?? '?'}`); return []; }
    const bins = Array.from({ length: n }, () => [0, 0, 0, 0]);
    for (let i = 0; i < vc; i++) {
      let b = Math.floor(((t[i] - mn) / (mx - mn + 1e-9)) * n);
      b = Math.max(0, Math.min(n - 1, b)); // Float32 舍入可能使 floor 越界一位
      bins[b][0] += g.pos[i * 3]; bins[b][1] += g.pos[i * 3 + 1]; bins[b][2] += g.pos[i * 3 + 2]; bins[b][3]++;
    }
    return bins.filter((b) => b[3] > 0).map((b) => [b[0] / b[3], b[1] / b[3], b[2] / b[3]]);
  };
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const autoCurves = [];
  for (const [sysName, list] of Object.entries(vascSel)) {
    const type = sysName === 'arterial' ? 'artery' : 'vein';
    for (const p of list) {
      if (HERO_HINT.test(p.name)) continue; // 主干留给手写解剖曲线
      const raw = readBP3DPart(atlas, p);
      const g = { pos: scaleArr(raw.pos, K_BP), idx: raw.idx };
      const pts = centerline(g, 12, p.name);
      if (pts.length < 4) continue;
      let len = 0; for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
      if (len < 0.035) continue; // 3.5cm 以下的碎片不成流
      // 方向：动脉离心（起点靠近心脏），静脉回心（起点远离心脏）
      const d0 = dist(pts[0], HEART), d1 = dist(pts[pts.length - 1], HEART);
      const artery = type === 'artery';
      if ((artery && d0 > d1) || (!artery && d0 < d1)) pts.reverse();
      autoCurves.push({
        id: `auto-${p.id}`, type, label: p.name,
        count: Math.max(24, Math.min(160, Math.round(len * 2000))),
        size: 0.55,
        points: pts.map((q) => q.map((v) => +v.toFixed(4))),
      });
    }
  }
  writeFileSync(P('src/data/vessels-auto.json'), JSON.stringify({ curves: autoCurves }, null, 1));
  log(`✓ 全人体粒子路径: ${autoCurves.length} 根, ${autoCurves.reduce((s, c) => s + c.count, 0).toLocaleString()} 粒子`);

}

/* ---------- 血管树双档（全量 + 移动端 economy） ---------- */
for (const [budget, outName] of [[320000, 'vasculature.glb'], [120000, 'vasculature-economy.glb']]) {
  const sel = { arterial: [], venous: [] };
  let tris = 0;
  for (const p of vascCand) {
    const t = p.indexCount / 3;
    if (tris + t > budget) continue;
    sel[p.system].push(p); tris += t;
  }
  const vdoc = new Document();
  const vscene = vdoc.createScene('vasculature');
  const vbuf = vdoc.createBuffer();
  const vmat = vdoc.createMaterial('vessel').setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0.05).setRoughnessFactor(0.5);
  for (const [sysName, list] of Object.entries(sel)) {
    if (!list.length) continue;
    const parts = list.map((p) => { const g = readBP3DPart(atlas, p); return { pos: scaleArr(g.pos, K_BP), nrm: g.nrm, idx: g.idx }; });
    const g = merge(parts, 1);
    const accP = vdoc.createAccessor().setBuffer(vbuf).setType('VEC3').setArray(g.pos);
    const accN = vdoc.createAccessor().setBuffer(vbuf).setType('VEC3').setArray(g.nrm);
    const accI = vdoc.createAccessor().setBuffer(vbuf).setType('SCALAR').setArray(g.idx);
    const prim = vdoc.createPrimitive().setAttribute('POSITION', accP).setAttribute('NORMAL', accN).setIndices(accI).setMaterial(vmat);
    const mesh = vdoc.createMesh(`m.${sysName}`); mesh.addPrimitive(prim);
    const node = vdoc.createNode(`v.${sysName}`); node.setMesh(mesh); vscene.addChild(node);
  }
  await writeCompressed(P(`public/models/${outName}`), vdoc);
  log(`✓ ${outName}: ${Math.round(tris).toLocaleString()} 三角`);
}

/* ---------- 几何助手（v5.2：weld → 细分 → 平滑 → 法线） ---------- */
function weldGeometry(g) {
  // 按位置焊接重复顶点：消除接缝（同位置不同法线的顶点是位移裂缝的根源）
  const E = 100000; // 0.01mm 精度
  const map = new Map();
  const remap = new Uint32Array(g.pos.length / 3);
  const np = [];
  for (let i = 0; i < g.pos.length / 3; i++) {
    const k = Math.round(g.pos[i * 3] * E) + '_' + Math.round(g.pos[i * 3 + 1] * E) + '_' + Math.round(g.pos[i * 3 + 2] * E);
    let j = map.get(k);
    if (j === undefined) { j = np.length / 3; np.push(g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]); map.set(k, j); }
    remap[i] = j;
  }
  const idx = new Uint32Array(g.idx.length);
  for (let t = 0; t < g.idx.length; t++) idx[t] = remap[g.idx[t]];
  return { pos: Float32Array.from(np), nrm: g.nrm, idx };
}

function refineGeometry(g, subdivide) {
  let pos = g.pos, idx = g.idx;
  ({ pos, idx } = weldGeometry({ pos, idx })); // 先焊接，细分/平滑/位移都建立在无缝网格上
  if (subdivide) {
    const E = 100000; // 顶点数远小于 1e7，用数值边键
    const edgeMap = new Map();
    for (let t = 0; t < idx.length; t += 3) {
      const tri = [idx[t], idx[t + 1], idx[t + 2]];
      for (let e = 0; e < 3; e++) {
        const a = tri[e], b = tri[(e + 1) % 3];
        const k = a < b ? a * E + b : b * E + a;
        if (!edgeMap.has(k)) edgeMap.set(k, -1);
      }
    }
    const vc0 = pos.length / 3;
    const pos2 = new Float32Array((vc0 + edgeMap.size) * 3);
    pos2.set(pos);
    let m = vc0;
    for (const [k] of edgeMap) {
      const a = Math.floor(k / E), b = k % E;
      pos2[m * 3] = (pos[a * 3] + pos[b * 3]) / 2;
      pos2[m * 3 + 1] = (pos[a * 3 + 1] + pos[b * 3 + 1]) / 2;
      pos2[m * 3 + 2] = (pos[a * 3 + 2] + pos[b * 3 + 2]) / 2;
      edgeMap.set(k, m); m++;
    }
    const mid = (a, b) => edgeMap.get(a < b ? a * E + b : b * E + a);
    const ni = new Uint32Array(idx.length * 4);
    for (let t = 0, o = 0; t < idx.length; t += 3, o += 12) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      ni[o] = a; ni[o + 1] = ab; ni[o + 2] = ca;
      ni[o + 3] = b; ni[o + 4] = bc; ni[o + 5] = ab;
      ni[o + 6] = c; ni[o + 7] = ca; ni[o + 8] = bc;
      ni[o + 9] = ab; ni[o + 10] = bc; ni[o + 11] = ca;
    }
    pos = pos2; idx = ni;
  }
  // 拉普拉斯平滑（连通分量内独立，不会跨部件桥接）
  const vc = pos.length / 3;
  const nbr = Array.from({ length: vc }, () => null);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    (nbr[a] ??= new Set()).add(b); (nbr[a]).add(c);
    (nbr[b] ??= new Set()).add(a); (nbr[b]).add(c);
    (nbr[c] ??= new Set()).add(a); (nbr[c]).add(b);
  }
  let src = pos;
  for (let iter = 0; iter < 2; iter++) {
    const dst = Float32Array.from(src);
    for (let i = 0; i < vc; i++) {
      const ns = nbr[i]; if (!ns) continue;
      let ax = 0, ay = 0, az = 0;
      for (const j of ns) { ax += src[j * 3]; ay += src[j * 3 + 1]; az += src[j * 3 + 2]; }
      const k = ns.size;
      dst[i * 3] = src[i * 3] * 0.6 + (ax / k) * 0.4;
      dst[i * 3 + 1] = src[i * 3 + 1] * 0.6 + (ay / k) * 0.4;
      dst[i * 3 + 2] = src[i * 3 + 2] * 0.6 + (az / k) * 0.4;
    }
    src = dst;
  }
  const nrm2 = new Float32Array(src.length);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = src[b] - src[a], uy = src[b + 1] - src[a + 1], uz = src[b + 2] - src[a + 2];
    const vx = src[c] - src[a], vy = src[c + 1] - src[a + 1], vz = src[c + 2] - src[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    nrm2[a] += nx; nrm2[a + 1] += ny; nrm2[a + 2] += nz;
    nrm2[b] += nx; nrm2[b + 1] += ny; nrm2[b + 2] += nz;
    nrm2[c] += nx; nrm2[c + 1] += ny; nrm2[c + 2] += nz;
  }
  for (let i = 0; i < nrm2.length; i += 3) {
    const l = Math.hypot(nrm2[i], nrm2[i + 1], nrm2[i + 2]) || 1;
    nrm2[i] /= l; nrm2[i + 1] /= l; nrm2[i + 2] /= l;
  }
  return { pos: src, nrm: nrm2, idx };
}

function boundsOf(g) {
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < g.pos.length; i += 3) {
    for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], g.pos[i + a]); mx[a] = Math.max(mx[a], g.pos[i + a]); }
  }
  return { mn, mx, center: mn.map((v, a) => (v + mx[a]) / 2), size: mn.map((v, a) => mx[a] - v) };
}

function sphereGeometry(r, lat = 10, lon = 14) {
  const pos = [], nrm = [], idx = [];
  for (let i = 0; i <= lat; i++) {
    const th = (i / lat) * Math.PI;
    for (let j = 0; j <= lon; j++) {
      const ph = (j / lon) * Math.PI * 2;
      const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
      pos.push(x * r, y * r, z * r); nrm.push(x, y, z);
    }
  }
  for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) {
    const a = i * (lon + 1) + j, b = a + lon + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return { pos: Float32Array.from(pos), nrm: Float32Array.from(nrm), idx: new Uint32Array(idx) };
}

/* ---------- 神经流道：ZA 神经部件中心线（信号从脑/脊髓发出） ---------- */
const nerveCurves = [];
const seenNerveMesh = new Set();
const nerveLeaves = collect('nervous.peripheral_nervous_system')
  .concat(collect('nervous.spinal_cord'), collect('nervous.spinal_nerves'))
  .filter((x) => x.meshes);
for (const st of nerveLeaves) {
  for (const mid of st.meshes) {
    if (seenNerveMesh.has(mid)) continue;
    seenNerveMesh.add(mid);
    const g0 = zaMeshes.get(mid);
    if (!g0) continue;
    const g = { pos: scaleArr(g0.pos, K_ZA).map((v, i) => (i % 3 === 2 ? v * 0.78 : v)), idx: g0.idx };
    // 排除头部段（脑神经由脑器官覆盖）
    let cy2 = 0, n2 = 0;
    for (let i = 1; i < g.pos.length; i += 3) { cy2 += g.pos[i]; n2++; }
    if (n2 && cy2 / n2 > 1.52) continue;
    const pts = centerline(g, 12, st.id);
    if (pts.length < 4) continue;
    const len = curveLen(pts);
    if (len < 0.04) continue;
    const d0 = dist3(pts[0], BRAIN), d1 = dist3(pts[pts.length - 1], BRAIN);
    if (d0 > d1) pts.reverse(); // 信号从脑/脊髓发出
    nerveCurves.push({
      id: `n-${st.id}-${mid}`, type: 'artery', label: st.id,
      count: Math.max(18, Math.min(90, Math.round(len * 1400))), size: 0.5,
      points: pts.map((q) => q.map((v) => +v.toFixed(4))),
    });
  }
}
writeFileSync(P('src/data/nerve-paths.json'), JSON.stringify({ curves: nerveCurves }, null, 1));
log(`✓ 神经流道: ${nerveCurves.length} 条, ${nerveCurves.reduce((s, c) => s + c.count, 0).toLocaleString()} 粒子`);

/* ---------- 神经节点锚点 ---------- */
const nerveNodeAnchors = {};
const NODE_TARGETS = [
  ['node-spinal-cord', 'nervous.spinal_cord'],
  ['node-brachial-plexus', 'nervous.brachial_plexus'],
  ['node-median-nerve', 'nervous.median_nerve_l'],
  ['node-sciatic-nerve', 'nervous.sciatic_nerve_l'],
  ['node-vagus-nerve', 'nervous.vagus_nerve_x_l'],
];
for (const [nid, sid] of NODE_TARGETS) {
  const self = manifest.structures.find((x) => x.id === sid);
  const meshes = (self?.meshes ? self.meshes : collect(sid).filter((x) => x.meshes).flatMap((x) => x.meshes));
  let cx = 0, cy = 0, cz = 0, n = 0;
  for (const mid of meshes) {
    const g0 = zaMeshes.get(mid); if (!g0) continue;
    const gz = scaleArr(g0.pos, K_ZA).map((v, i) => (i % 3 === 2 ? v * 0.78 : v));
    const bb = boundsOf({ pos: gz, idx: g0.idx });
    cx += bb.center[0]; cy += bb.center[1]; cz += bb.center[2]; n++;
  }
  if (n) nerveNodeAnchors[nid] = [+(cx / n).toFixed(4), +(cy / n).toFixed(4), +(cz / n).toFixed(4)];
}
writeFileSync(P('tools/tmp/nerve-anchors.json'), JSON.stringify(nerveNodeAnchors, null, 1));
log(`✓ 神经节点锚点: ${JSON.stringify(nerveNodeAnchors)}`);

/* ---------- 写 nervous.glb（脊髓 + 外周神经 + 节点球） ---------- */
const vNervous = new Document();
const vNervousScene = vNervous.createScene('nervous');
const vNervousBuf = vNervous.createBuffer();
const vNervousMat = vNervous.createMaterial('nerve').setBaseColorFactor([0.95, 0.89, 0.48, 1]).setMetallicFactor(0.05).setRoughnessFactor(0.5);
const nervesEntry = organs.get('nerves');
organs.delete('nerves');
if (nervesEntry) {
  const g = merge(nervesEntry, 1);
  let npos = scaleArr(g.pos, K_ZA), nidx = g.idx, nnrm = g.nrm;
  for (let i = 2; i < npos.length; i += 3) npos[i] *= 0.78; // ZA 原版体格比 hpfrei 深，Z 向内收（贴合测量）
  const r = refineGeometry({ pos: npos, idx: nidx }, false);
  npos = r.pos; nnrm = r.nrm; nidx = r.idx;
  const bc = boundsOf({ pos: npos, idx: nidx });
  for (let i = 0; i < npos.length; i += 3) { npos[i] -= bc.center[0]; npos[i + 1] -= bc.center[1]; npos[i + 2] -= bc.center[2]; }
  const accP = vNervous.createAccessor().setBuffer(vNervousBuf).setType('VEC3').setArray(npos);
  const accN = vNervous.createAccessor().setBuffer(vNervousBuf).setType('VEC3').setArray(nnrm);
  const accI = vNervous.createAccessor().setBuffer(vNervousBuf).setType('SCALAR').setArray(nidx);
  const prim = vNervous.createPrimitive().setAttribute('POSITION', accP).setAttribute('NORMAL', accN).setIndices(accI).setMaterial(vNervousMat);
  const mesh = vNervous.createMesh('m.nerves'); mesh.addPrimitive(prim);
  const node = vNervous.createNode('o.nerves'); node.setMesh(mesh); node.setTranslation([bc.center[0], bc.center[1], bc.center[2]]); vNervousScene.addChild(node);
  anchors.organs['nerves'] = { center: bc.center.map((v) => +v.toFixed(4)), min: bc.mn.map((v) => +v.toFixed(4)), max: bc.mx.map((v) => +v.toFixed(4)), tris: nidx.length / 3 };
  log(`✓ nervous.nerves: ${(nidx.length / 3).toLocaleString()} 三角, center=[${bc.center.map((v) => v.toFixed(3))}]`);
}
for (const [nid, c] of Object.entries(nerveNodeAnchors)) {
  const g = sphereGeometry(0.0085, 10, 12);
  const accP = vNervous.createAccessor().setBuffer(vNervousBuf).setType('VEC3').setArray(g.pos);
  const accN = vNervous.createAccessor().setBuffer(vNervousBuf).setType('VEC3').setArray(g.nrm);
  const accI = vNervous.createAccessor().setBuffer(vNervousBuf).setType('SCALAR').setArray(g.idx);
  const prim = vNervous.createPrimitive().setAttribute('POSITION', accP).setAttribute('NORMAL', accN).setIndices(accI).setMaterial(vNervousMat);
  const mesh = vNervous.createMesh(`m.${nid}`); mesh.addPrimitive(prim);
  const node = vNervous.createNode(`o.${nid}`); node.setMesh(mesh); node.setTranslation([c[0], c[1], c[2]]); vNervousScene.addChild(node);
  anchors.organs[nid] = { center: c, min: c, max: c, tris: g.idx.length / 3 };
  log(`✓ ${nid}: 节点标记`);
}
await writeCompressed(P('public/models/nervous.glb'), vNervous);
log('输出: public/models/nervous.glb');

/* ---------- 食物之旅：消化路径（真实部件串联） ---------- */
function partCenter(fjid) {
  const p = atlas.parts.find((x) => x.id === fjid); if (!p) return null;
  return [((p.bounds[0][0] + p.bounds[1][0]) / 2) * K_BP, ((p.bounds[0][1] + p.bounds[1][1]) / 2) * K_BP, ((p.bounds[0][2] + p.bounds[1][2]) / 2) * K_BP];
}
function partCenterline(fjid, n = 8) {
  const p = atlas.parts.find((x) => x.id === fjid); if (!p) return null;
  const g = readBP3DPart(atlas, p);
  return centerline({ pos: scaleArr(g.pos, K_BP), idx: g.idx }, n, p.name) ?? [partCenter(fjid)];
}
const dWay = [];
const dSegs = [];
const pushWay = (pts, label) => {
  if (!pts || !Array.isArray(pts)) return;
  pts = pts.filter((p) => Array.isArray(p) && p.length === 3 && p.every(isFinite));
  if (pts.length < 1) return;
  const t0 = dWay.length === 0 ? 0 : dSegs[dSegs.length - 1].to;
  dWay.push(...pts.filter((p) => p.every(isFinite)));
  // 段边界在长度计算后回填
  dSegs.push({ label, from: t0, wpFrom: dWay.length - pts.length, wpTo: dWay.length - 1 });
};
dSegs.length = 0;
// 1) 食管（上→下）
pushWay(partCenterline('FJ2563', 6), '食管');
// 2) 胃（中心驻留点，进+出）
const stomC = partCenter('FJ2564');
pushWay([[stomC[0] + 0.02, stomC[1] + 0.03, stomC[2]], stomC, [stomC[0] - 0.02, stomC[1] - 0.04, stomC[2] + 0.01]], '胃');
// 3) 十二指肠
pushWay(partCenterline('FJ2573', 6), '十二指肠');
// 4) 小肠：空肠+回肠部件中心按 y 降序（上→下蜿蜒）
const siPts = atlas.parts
  .filter((p) => /part of (ileum|jejunum)$/.test(p.name))
  .map((p) => partCenter(p.id))
  .filter(Boolean)
  .sort((a, b) => b[1] - a[1]);
const siSel = siPts.filter((_, i) => i % 3 === 0);
pushWay(siSel, '小肠');
// 5) 大肠：回盲部→升结肠(下→上)→横结肠→降结肠(上→下)→直肠
pushWay([partCenter('FJ2565')], '阑尾');
pushWay(partCenterline('FJ2566', 5).slice().sort((a, b) => a[1] - b[1]), '升结肠');
pushWay(partCenterline('FJ2572', 5).slice().sort((a, b) => b[0] - a[0]), '横结肠');
pushWay(partCenterline('FJ2567', 5).slice().sort((a, b) => b[1] - a[1]), '降结肠');
pushWay([partCenter('FJ2571')], '直肠');
// 去重相邻过近点（保留 原始索引→去重索引 映射）+ 计算段边界（累计弧长比例）
const dClean = [dWay[0]];
const o2k = [0];
for (let i = 1; i < dWay.length; i++) {
  const p = dWay[i], l = dClean[dClean.length - 1];
  if (Math.hypot(p[0] - l[0], p[1] - l[1], p[2] - l[2]) > 0.012) dClean.push(p);
  o2k.push(dClean.length - 1);
}
let total = 0; const cum = [0];
for (let i = 1; i < dClean.length; i++) { total += Math.hypot(dClean[i][0] - dClean[i - 1][0], dClean[i][1] - dClean[i - 1][1], dClean[i][2] - dClean[i - 1][2]); cum.push(total); }
const dSegsOut = [];
for (const seg of dSegs) {
  const raw0 = dSegsOut.length ? dSegsOut[dSegsOut.length - 1].t1 : 0;
  const raw1 = cum[o2k[seg.wpTo]] / total;
  if (raw1 <= raw0 + 0.005) continue; // 零宽段并入前段
  dSegsOut.push({ label: seg.label, t0: +raw0.toFixed(4), t1: +Math.min(1, raw1).toFixed(4) });
}
if (dSegsOut.length) dSegsOut[dSegsOut.length - 1].t1 = 1;
// 消除零宽段（并入前段）
for (let i = dSegsOut.length - 1; i >= 0; i--) {
  if (dSegsOut[i].t1 - dSegsOut[i].t0 < 0.005 && dSegsOut.length > 1) {
    if (i > 0) dSegsOut[i - 1].t1 = dSegsOut[i].t1;
    dSegsOut.splice(i, 1);
  }
}
writeFileSync(P('src/data/digestive-path.json'), JSON.stringify({ waypoints: dClean.map((p) => p.map((v) => +v.toFixed(4))), segments: dSegsOut }, null, 1));
log(`✓ 食物之旅路径: ${dClean.length} 路点, ${dSegsOut.length} 段 [${dSegsOut.map((s) => s.label).join('→')}]`);

/* ---------- 写 organs.glb ---------- */
const out = new Document();
const scene = out.createScene('organs');
const mat = out.createMaterial('organ-default')
  .setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0.1).setRoughnessFactor(0.55);
const buffer = out.createBuffer();

function boundsOf2(g) { return boundsOf(g); } // 兼容别名

const BP3D_IDS = new Set(['skin', 'esophagus', 'small-intestine', 'large-intestine', 'spleen', 'pancreas', 'gallbladder', 'trachea-bronchi', 'thymus', 'diaphragm']);
const SKIP_REFINE = new Set(['skin', 'brain', 'trachea-bronchi', 'diaphragm']);
for (const [organId, parts] of organs) {
  const g = merge(parts, 1);
  let pos = g.pos, nrm = g.nrm, idx = g.idx;
  if (!BP3D_IDS.has(organId)) pos = scaleArr(pos, K_ZA); // ZA 原始坐标统一缩放到 body 空间；BP3D 已在入 map 时缩放
  if (!SKIP_REFINE.has(organId)) {
    const tris = idx.length / 3;
    const r = refineGeometry({ pos, idx }, tris < 15000);
    pos = r.pos; nrm = r.nrm; idx = r.idx;
  }
  // 枢轴重定向：节点原点移到自身包围盒中心（否则病变缩放绕脚底原点，器官会整体上移）
  const bc = boundsOf({ pos, idx });
  for (let i = 0; i < pos.length; i += 3) { pos[i] -= bc.center[0]; pos[i + 1] -= bc.center[1]; pos[i + 2] -= bc.center[2]; }
  const accP = out.createAccessor().setBuffer(buffer).setType('VEC3').setArray(pos);
  const accN = out.createAccessor().setBuffer(buffer).setType('VEC3').setArray(nrm);
  const accI = out.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(idx);
  const prim = out.createPrimitive().setAttribute('POSITION', accP).setAttribute('NORMAL', accN).setIndices(accI).setMaterial(mat);
  const mesh = out.createMesh(`m.${organId}`); mesh.addPrimitive(prim);
  const node = out.createNode(`o.${organId}`); node.setMesh(mesh); scene.addChild(node);
  node.setTranslation([bc.center[0], bc.center[1], bc.center[2]]);
  anchors.organs[organId] = { center: bc.center.map((v) => +v.toFixed(4)), min: bc.mn.map((v) => +v.toFixed(4)), max: bc.mx.map((v) => +v.toFixed(4)), tris: idx.length / 3 };
  log(`✓ ${organId}: ${(idx.length / 3).toLocaleString()} 三角, center=[${bc.center.map((v) => v.toFixed(3))}]`);
}

await writeCompressed(P('public/models/organs.glb'), out);
writeFileSync(P('tools/tmp/anchors.json'), JSON.stringify(anchors, null, 1));
log(`\n输出: public/models/organs.glb, tools/tmp/anchors.json (${Object.keys(anchors.arteries).length} 动脉锚点)`);
