// 一次性补丁：给 build-organs.mjs 接入 meshopt 压缩写出
import { readFileSync, writeFileSync } from 'node:fs';

let s = readFileSync('tools/build-organs.mjs', 'utf8');
let ok = true;
const must = (cond, msg) => { if (!cond) { console.error('PATCH FAIL:', msg); ok = false; } };

s = s.replace(
  "import { MeshoptDecoder } from 'meshoptimizer';",
  "import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';",
);
must(s.includes("MeshoptDecoder, MeshoptEncoder"), 'encoder import');

s = s.replace(
  "import { ALL_EXTENSIONS } from '@gltf-transform/extensions';",
  "import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';",
);
must(s.includes('EXTMeshoptCompression },'), 'extension import');

const helper = `
await MeshoptEncoder.ready;
async function writeCompressed(path, doc) {
  doc.createExtension(EXTMeshoptCompression).setRequired(true);
  const ioOut = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'draco3d.decoder': dracoDecoder, 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  await ioOut.write(path, doc);
}
`;
s = s.replace('/* ---------- gltf-transform IO ---------- */', helper + '\n/* ---------- gltf-transform IO ---------- */');
must(s.includes('async function writeCompressed'), 'helper');

const before = (s.match(/await new NodeIO\(\)\.registerExtensions\(ALL_EXTENSIONS\)\.registerDependencies\(\{ 'draco3d\.decoder': dracoDecoder, 'meshopt\.decoder': MeshoptDecoder \}\)\.write\(/g) || []).length;
must(before === 2, `two write sites, found ${before}`);
s = s.replace(
  /await new NodeIO\(\)\.registerExtensions\(ALL_EXTENSIONS\)\.registerDependencies\(\{ 'draco3d\.decoder': dracoDecoder, 'meshopt\.decoder': MeshoptDecoder \}\)\.write\(/g,
  'await writeCompressed(',
);

writeFileSync('tools/build-organs.mjs', s);
console.log(ok ? 'patched OK' : 'patched with errors');
