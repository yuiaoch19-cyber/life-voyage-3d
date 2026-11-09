// 拾取：悬停描边 + tooltip，点击选中器官；体格层悬停显示部位名
import * as THREE from 'three';
import { Mesh, Raycaster, Vector2 } from 'three';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree, MeshBVH } from 'three-mesh-bvh';

// three-mesh-bvh 加速高面数模型的 raycast
Mesh.prototype.raycast = acceleratedRaycast;
Object.assign((THREE.BufferGeometry.prototype as unknown as Record<string, unknown>), {
  computeBoundsTree, disposeBoundsTree, boundsTree: undefined,
});
type PatchedGeom = THREE.BufferGeometry & { computeBoundsTree: (o?: object) => MeshBVH };

export interface PickTarget { mesh: Mesh; organId: string | null; label: string; labelEn?: string; }

export class Picking {
  raycaster = new Raycaster();
  targets: PickTarget[] = [];
  hovered: PickTarget | null = null;
  private downPos = new Vector2();
  private downTime = 0;

  constructor(
    private camera: THREE.Camera,
    private dom: HTMLElement,
    private onHover: (t: PickTarget | null, x: number, y: number) => void,
    private onSelect: (t: PickTarget | null) => void,
  ) {
    dom.addEventListener('pointermove', this.onMove);
    dom.addEventListener('pointerdown', this.onDown);
    dom.addEventListener('pointerup', this.onUp);
  }

  register(mesh: Mesh, organId: string | null, label: string, labelEn?: string) {
    (mesh.geometry as PatchedGeom).computeBoundsTree?.({});
    this.targets.push({ mesh, organId, label, labelEn });
  }

  private cast(x: number, y: number): PickTarget | null {
    const r = this.dom.getBoundingClientRect();
    const nx = ((x - r.left) / r.width) * 2 - 1;
    const ny = -((y - r.top) / r.height) * 2 + 1;
    this.raycaster.setFromCamera(new Vector2(nx, ny), this.camera);
    // three 的 Raycaster 不检查 visible，必须自己过滤：
    // 否则关闭「器官」图层后仍能点中隐形器官、弹出面板（实测复现）。
    const meshes = this.targets.filter((t) => {
      if (t.mesh.userData['pickable'] === false || !t.mesh.visible) return false;
      const m = t.mesh.material as THREE.Material | THREE.Material[];
      return Array.isArray(m) ? m.every((x) => x.visible) : m.visible;
    }).map((t) => t.mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    return this.targets.find((t) => t.mesh === hits[0].object) ?? null;
  }

  private onMove = (e: PointerEvent) => {
    const t = this.cast(e.clientX, e.clientY);
    if (t !== this.hovered) {
      this.hovered = t;
      this.onHover(t, e.clientX, e.clientY);
    } else if (t) {
      this.onHover(t, e.clientX, e.clientY);
    }
  };

  private onDown = (e: PointerEvent) => {
    this.downPos.set(e.clientX, e.clientY);
    this.downTime = performance.now();
  };

  private onUp = (e: PointerEvent) => {
    const dx = e.clientX - this.downPos.x, dy = e.clientY - this.downPos.y;
    if (Math.hypot(dx, dy) > 6 || performance.now() - this.downTime > 450) return; // 拖拽不算点击
    const t = this.cast(e.clientX, e.clientY);
    this.onSelect(t);
  };

  dispose() {
    this.dom.removeEventListener('pointermove', this.onMove);
    this.dom.removeEventListener('pointerdown', this.onDown);
    this.dom.removeEventListener('pointerup', this.onUp);
    for (const t of this.targets) (t.mesh.geometry as PatchedGeom).disposeBoundsTree?.();
  }
}
