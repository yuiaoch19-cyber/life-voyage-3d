// 神经-体表贴合度测量：按 y 分带对比 body.glb 与 nervous.glb 的横向包围宽度
// 用法: node tools/measure-nerve-fit.mjs
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.decoder': MeshoptDecoder });

async function slices(path) {
  const doc = await io.read(path);
  const bands = new Map(); // yBand -> {minX, maxX, minZ, maxZ, n}
  const BAND = 0.08;
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const M = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'); if (!pos) continue;
      const arr = pos.getArray(); const norm = pos.getNormalized();
      const s = norm && arr instanceof Int16Array ? 1 / 32767 : norm && arr instanceof Uint16Array ? 1 / 65535 : 1;
      const isInt = arr instanceof Int16Array || arr instanceof Uint16Array;
      for (let i = 0; i < pos.getCount(); i++) {
        const x0 = isInt ? arr[i * 3] * s : arr[i * 3];
        const y0 = isInt ? arr[i * 3 + 1] * s : arr[i * 3 + 1];
        const z0 = isInt ? arr[i * 3 + 2] * s : arr[i * 3 + 2];
        const w = [x0, y0, z0];
        const p = [M[0] * w[0] + M[4] * w[1] + M[8] * w[2] + M[12], M[1] * w[0] + M[5] * w[1] + M[9] * w[2] + M[13], M[2] * w[0] + M[6] * w[1] + M[10] * w[2] + M[14]];
        const band = Math.floor(p[1] / BAND);
        let b = bands.get(band);
        if (!b) { b = { minX: 1e9, maxX: -1e9, minZ: 1e9, maxZ: -1e9, n: 0 }; bands.set(band, b); }
        b.minX = Math.min(b.minX, p[0]); b.maxX = Math.max(b.maxX, p[0]);
        b.minZ = Math.min(b.minZ, p[2]); b.maxZ = Math.max(b.maxZ, p[2]); b.n++;
      }
    }
  }
  return bands;
}

const body = await slices('public/models/body.glb');
const nerve = await slices('public/models/nervous.glb');
console.log('y带 | 体格 |x|max | 神经 |x|max | 超出 | 体格 |z|max | 神经 |z|max | 超出');
for (const [band, b] of [...body.entries()].sort((a, b2) => a[0] - b2[0])) {
  const n = nerve.get(band);
  if (!n || b.n < 50) continue;
  const bodyX = Math.max(Math.abs(b.minX), Math.abs(b.maxX));
  const nerveX = Math.max(Math.abs(n.minX), Math.abs(n.maxX));
  const bodyZ = Math.max(Math.abs(b.minZ), Math.abs(b.maxZ));
  const nerveZ = Math.max(Math.abs(n.minZ), Math.abs(n.maxZ));
  const overX = nerveX > bodyX + 0.005 ? ' <<X超出' : '';
  const overZ = nerveZ > bodyZ + 0.005 ? ' <<Z超出' : '';
  if (overX || overZ || band % 3 === 0) {
    console.log(`y${(band * 0.08).toFixed(2)}-${((band + 1) * 0.08).toFixed(2)} | ${bodyX.toFixed(3)} | ${nerveX.toFixed(3)} |${overX} | ${bodyZ.toFixed(3)} | ${nerveZ.toFixed(3)} |${overZ}`);
  }
}
