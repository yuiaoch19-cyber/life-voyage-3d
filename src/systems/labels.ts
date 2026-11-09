// 3D 标注系统：CSS2DObject 锚在器官表面前向点，BVH 射线做遮挡淡出
// + 屏幕空间避让（左右两列各自按 y 贪心下推，消除标签互相遮挡）
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { organById, store } from '../state';

export interface LabelHandle {
  setVisible: (v: boolean) => void;
  update: (camera: THREE.PerspectiveCamera, occluders: THREE.Mesh[]) => void;
  resize: (w: number, h: number) => void;
}

const AVOID_GAP = 9;        // 同列标签之间的最小垂直间距
const AVOID_MAX_SHIFT = 200; // 单个标签最大下推距离
const MAX_LABELS = 12;      // 全景且未选中时同时显示的标签上限

export function initLabels(
  scene: THREE.Scene,
  container: HTMLElement,
  organMeshes: Map<string, THREE.Mesh[]>,
): LabelHandle {
  const renderer = new CSS2DRenderer({ element: container });
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.inset = '0';
  renderer.domElement.style.pointerEvents = 'none';
  renderer.domElement.style.overflow = 'hidden';

  const entries: { obj: CSS2DObject; el: HTMLElement; organId: string; occl: number }[] = [];
  let li = 0;
  for (const [organId, meshes] of organMeshes) {
    const def = organById.get(organId);
    if (!def || organId === 'skin') continue;
    const mesh = meshes[0];
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox!;
    const size = bb.getSize(new THREE.Vector3());
    const center = bb.getCenter(new THREE.Vector3());
    // 锚点：按解剖学左右归属外扩（肝偏右、胃偏左……中线器官左右交替），上缘抬升
    const side = Math.abs(center.x) > 0.02 ? Math.sign(center.x) : (li % 2 === 0 ? -1 : 1);
    li++;
    const anchor = new THREE.Vector3(
      center.x + side * (size.x * 0.36 + 0.05),
      center.y + size.y * 0.12,
      center.z + size.z * 0.42,
    ).sub(center);
    const el = document.createElement('div');
    el.className = 'lbl';
    el.textContent = def.nameZh;
    const obj = new CSS2DObject(el);
    obj.position.copy(anchor);
    mesh.add(obj);
    entries.push({ obj, el, organId, occl: 0 });
  }

  const raycaster = new THREE.Raycaster();
  let visible = true;
  let frame = 0;
  const camPos = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const world = new THREE.Vector3();
  const dir = new THREE.Vector3();

  return {
    setVisible(v) { visible = v; },
    update(camera, occluders) {
      frame++;
      const s = store.s;
      for (const e of entries) {
        const def = organById.get(e.organId)!;
        const mat = (e.obj.parent as THREE.Mesh)?.material as THREE.Material | undefined;
        const organVisible = !!mat && mat.visible !== false && (e.obj.parent as THREE.Mesh).visible;
        // 只显示当前系统的标签（选中/悬停的始终保留），全景下也不再一股脑糊满 22 个
        const inSystem = s.system === 'all' || def.system === s.system;
        const focused = s.selected === e.organId || s.hovered === e.organId;
        const shouldShow = visible && organVisible && (focused || inSystem);
        e.obj.visible = shouldShow;
        if (!shouldShow) { e.el.style.opacity = '0'; continue; }

        camera.getWorldPosition(camPos);
        camera.getWorldDirection(camDir);
        e.obj.getWorldPosition(world);
        dir.copy(world).sub(camPos);
        const dist = dir.length();
        dir.normalize();
        // 背对相机 → 隐藏
        if (camDir.dot(dir) <= 0.05) { e.el.style.opacity = '0'; continue; }
        // 遮挡检测（隔帧节流）
        if (frame % 2 === 0) {
          raycaster.set(camPos, dir);
          raycaster.far = dist - 0.04;
          const hits = raycaster.intersectObjects(occluders, false);
          const blocked = hits.some((h) => h.object !== (e.obj.parent as THREE.Mesh) && h.distance < dist - 0.04);
          e.occl = blocked ? Math.min(1, e.occl + 0.34) : Math.max(0, e.occl - 0.34);
        }
        e.el.style.opacity = String(1 - e.occl * 0.88);
      }
      // 密度控制：全景未选中时 22 个标签会形成标签墙，按屏幕纵向均匀抽样保留 12 个。
      // 选中器官或切换系统后自动让位给当前系统的全部标签。
      if (s.system === 'all' && !s.selected) {
        const candidates = entries.filter((e) => e.obj.visible);
        if (candidates.length > MAX_LABELS) {
          const withY = candidates.map((e) => {
            e.obj.getWorldPosition(world);
            return { e, y: world.clone().project(camera).y };
          }).sort((a, b) => b.y - a.y);
          const keep = new Set<(typeof entries)[number]>();
          for (let i = 0; i < MAX_LABELS; i++) keep.add(withY[Math.floor(i * withY.length / MAX_LABELS)].e);
          for (const c of withY) {
            if (!keep.has(c.e)) { c.e.obj.visible = false; c.e.el.style.opacity = '0'; }
          }
        }
      }
      renderer.render(scene, camera);

      // ---- 屏幕空间避让 ----
      // CSS2DRenderer 每帧重设 transform，所以在 render 之后追加 translateY；
      // 下一帧会被覆盖，不会累积。测量用「未避让」的原始位置。
      type Item = { el: HTMLElement; left: number; top: number; w: number; h: number; side: number; dy: number; extra: number };
      const items: Item[] = [];
      for (const e of entries) {
        if (!e.obj.visible || parseFloat(e.el.style.opacity || '1') < 0.45) continue;
        const r = e.el.getBoundingClientRect();
        if (r.width === 0) continue;
        items.push({
          el: e.el, left: r.left, top: r.top, w: r.width, h: r.height,
          side: r.left + r.width / 2 < window.innerWidth / 2 ? 0 : 1,
          dy: 0, extra: 0,
        });
      }
      // 第一轮：左右两列各自按 y 贪心下推
      for (const side of [0, 1]) {
        const col = items.filter((i) => i.side === side).sort((a, b) => a.top - b.top);
        let freeY = -Infinity;
        for (const it of col) {
          it.dy = Math.max(0, Math.min(AVOID_MAX_SHIFT, freeY - it.top));
          freeY = it.top + it.dy + it.h + AVOID_GAP;
        }
      }
      // 第二轮：全局检查，处理分列边界处的跨列水平重叠
      const placed: Item[] = [];
      for (const it of [...items].sort((a, b) => (a.top + a.dy) - (b.top + b.dy))) {
        let extra = 0;
        for (const p of placed) {
          const py = p.top + p.dy + p.extra;
          const iy = it.top + it.dy + extra;
          const ox = Math.min(it.left + it.w, p.left + p.w) - Math.max(it.left, p.left);
          const oy = Math.min(iy + it.h, py + p.h) - Math.max(iy, py);
          if (ox > 2 && oy > 2) extra = Math.max(extra, py + p.h + AVOID_GAP - (it.top + it.dy));
        }
        it.extra = Math.min(AVOID_MAX_SHIFT, Math.max(0, extra));
        placed.push(it);
      }
      for (const it of items) {
        const total = it.dy + it.extra;
        if (total > 0.5) it.el.style.transform += ` translateY(${total.toFixed(1)}px)`;
      }
    },
    resize(w, h) { renderer.setSize(w, h); },
  };
}
