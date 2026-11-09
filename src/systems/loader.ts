// 资源加载：body.glb（体格层）+ organs.glb（器官层），带进度回调
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export interface BodyPartInfo { name: string; type: string; wiki?: string; }
export interface LoadedModel {
  organMeshes: Map<string, THREE.Mesh[]>;
  bodyMeshes: { mesh: THREE.Mesh; info: BodyPartInfo }[];
  organRoot: THREE.Group;
  bodyRoot: THREE.Group;
}

export function loadAll(onProgress: (frac: number, label: string) => void): Promise<LoadedModel> {
  const mobile = window.matchMedia('(max-width: 900px)').matches;
  const draco = new DRACOLoader();
  draco.setDecoderPath('./draco/');
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);

  const organMeshes = new Map<string, THREE.Mesh[]>();
  const bodyMeshes: { mesh: THREE.Mesh; info: BodyPartInfo }[] = [];
  const organRoot = new THREE.Group();
  const bodyRoot = new THREE.Group();
  organRoot.name = 'organRoot';
  bodyRoot.name = 'bodyRoot';

  const tasks: { url: string; label: string; weight: number; run: (g: THREE.Group) => void }[] = [
    {
      url: './models/body.glb', label: '体格层 · 肌肉与骨骼', weight: 0.35,
      run: (g) => {
        g.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          const src = (o.userData ?? {}) as Record<string, unknown>;
          const info: BodyPartInfo = {
            name: String(src['name'] ?? o.name ?? ''),
            type: String(src['type'] ?? 'other'),
            wiki: typeof src['wikiLink'] === 'string' ? (src['wikiLink'] as string) : undefined,
          };
          bodyMeshes.push({ mesh: o, info });
          o.userData['layer'] = 'body';
          o.userData['part'] = info;
        });
        bodyRoot.add(g);
      },
    },
    {
      url: './models/organs.glb', label: '器官层 · 精细器官', weight: 0.3,
      run: (g) => {
        g.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          // GLTFLoader 会把节点名里的 '.' 剥掉（o.heart → oheart），原始名在 userData.name
          const raw = String(o.userData['name'] ?? o.name ?? '');
          const m = /^o\.([a-z-]+)$/i.exec(raw);
          if (!m) return;
          const id = m[1];
          o.userData['layer'] = 'organ';
          o.userData['organId'] = id;
          const list = organMeshes.get(id) ?? [];
          list.push(o);
          organMeshes.set(id, list);
        });
        organRoot.add(g);
      },
    },
    {
      url: mobile ? './models/vasculature-economy.glb' : './models/vasculature.glb', label: '循环系统 · 血管树', weight: 0.2,
      run: (g) => {
        g.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          o.userData['layer'] = 'vasculature';
          o.userData['vasculature'] = /venous/.test(o.userData['name'] ?? '') || /venous/.test(o.name) ? 'venous' : 'arterial';
        });
        organRoot.userData['vasculature'] = g;
        // 挂到 organRoot 下随场景走，但由主流程单独控制可见性
        organRoot.add(g);
      },
    },
    {
      url: './models/nervous.glb', label: '神经系统 · 脊髓与外周神经', weight: 0.15,
      run: (g) => {
        g.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          const raw = String(o.userData['name'] ?? o.name ?? '');
          const m = /^o\.([a-z-]+)$/i.exec(raw);
          if (!m) return;
          o.userData['layer'] = 'organ';
          o.userData['organId'] = m[1];
          o.userData['nervous'] = true;
          const list = organMeshes.get(m[1]) ?? [];
          list.push(o);
          organMeshes.set(m[1], list);
        });
        organRoot.add(g);
      },
    },
  ];

  let done = 0;
  const total = tasks.length;

  return new Promise((resolve, reject) => {
    let settled = false;
    const next = (i: number) => {
      if (i >= tasks.length) {
        draco.dispose(); // Worker 池常驻，加载完成后释放
        if (!settled) { settled = true; resolve({ organMeshes, bodyMeshes, organRoot, bodyRoot }); }
        return;
      }
      const task = tasks[i];
      loader.load(
        task.url,
        (gltf) => {
          task.run(gltf.scene);
          done++;
          onProgress(0.15 + (done / total) * 0.8, task.label);
          next(i + 1);
        },
        (ev) => {
          const f = ev.total ? ev.loaded / ev.total : 0;
          onProgress(0.15 + ((done + f) / total) * 0.8, task.label);
        },
        (err) => { if (!settled) { settled = true; draco.dispose(); reject(err); } },
      );
    };
    onProgress(0.05, '初始化场景');
    next(0);
  });
}
