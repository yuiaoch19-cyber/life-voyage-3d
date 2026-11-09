// 食物之旅：一颗琥珀色食物球沿消化路径循环，尾迹粒子 + 字幕联动
import * as THREE from 'three';
import digestiveJson from '../data/digestive-path.json';

interface Seg { label: string; t0: number; t1: number; }

const DURATION = 45; // 全程秒数
const TRAIL = 26;    // 尾迹粒子数

export class FoodJourney {
  group = new THREE.Group();
  private ball: THREE.Mesh;
  private trail: THREE.Points;
  private trailPos: Float32Array;
  private path: THREE.CatmullRomCurve3;
  private segs: Seg[];
  private t = 0;
  private visible = false;
  private captionEl: HTMLElement;
  private ballMat: THREE.MeshBasicMaterial;
  private trailMat: THREE.PointsMaterial;
  private segEl!: HTMLElement;
  private pctEl!: HTMLElement;
  private lastSeg = '';
  private lastPct = -1;

  constructor(captionEl: HTMLElement, isMobile: boolean) {
    const data = digestiveJson as unknown as { waypoints: [number, number, number][]; segments: Seg[] };
    this.segs = data.segments;
    this.captionEl = captionEl;
    this.path = new THREE.CatmullRomCurve3(
      data.waypoints.map((p) => new THREE.Vector3(...p)),
      false, 'catmullrom', 0.2,
    );

    this.group.name = 'foodJourney';
    this.group.visible = false;

    // 食物球：暖琥珀色
    this.ballMat = new THREE.MeshBasicMaterial({ color: '#ffb84d', transparent: true, opacity: 0.95, depthTest: false });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.007, 10, 10), this.ballMat);
    this.ball.renderOrder = 12;
    this.group.add(this.ball);

    // 尾迹：渐隐小粒子
    this.trailPos = new Float32Array(TRAIL * 3);
    const tGeo = new THREE.BufferGeometry();
    const sizes = new Float32Array(TRAIL);
    for (let i = 0; i < TRAIL; i++) sizes[i] = 2.4 * (1 - i / TRAIL);
    tGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    tGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    this.trailMat = new THREE.PointsMaterial({
      color: '#ffcf7a', size: isMobile ? 4 : 6, sizeAttenuation: false,
      transparent: true, opacity: 0.65, depthWrite: false, depthTest: false,
    });
    this.trail = new THREE.Points(tGeo, this.trailMat);
    this.trail.renderOrder = 11;
    this.trail.frustumCulled = false;
    this.group.add(this.trail);

    // 静态结构：只有「段名」位于 aria-live 区域，逐帧变化的进度设 aria-hidden，
    // 避免读屏每帧播报「食物之旅 正在经过… %」。
    this.captionEl.innerHTML = '<b>食物之旅</b><span class="food-seg" aria-live="polite">正在经过：<b>—</b></span><i aria-hidden="true">0%</i>';
    this.segEl = this.captionEl.querySelector('.food-seg b') as HTMLElement;
    this.pctEl = this.captionEl.querySelector('i') as HTMLElement;
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.group.visible = v;
    if (!v) this.captionEl.hidden = true;
  }

  update(dt: number) {
    if (!this.visible) { this.captionEl.hidden = true; return; }
    this.t = (this.t + dt / DURATION) % 1;
    const p = this.path.getPointAt(this.t);
    this.ball.position.copy(p);
    // 尾迹：沿路径回溯
    for (let i = 0; i < TRAIL; i++) {
      const tt = Math.max(0, this.t - i * 0.004);
      const tp = this.path.getPointAt(tt);
      this.trailPos[i * 3] = tp.x; this.trailPos[i * 3 + 1] = tp.y; this.trailPos[i * 3 + 2] = tp.z;
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
    // 呼吸微缩放（食物球也是活的）
    const s = 1 + 0.2 * Math.sin(this.t * Math.PI * 2 * 6);
    this.ball.scale.setScalar(s);
    // 字幕：段名变化时才写 live 区域；进度单独更新且不进入无障碍树
    const seg = this.segs.find((sg) => this.t >= sg.t0 && this.t <= sg.t1);
    const label = seg?.label ?? '消化道';
    if (label !== this.lastSeg) { this.segEl.textContent = label; this.lastSeg = label; }
    const pct = Math.round(this.t * 100);
    if (pct !== this.lastPct) { this.pctEl.textContent = pct + '%'; this.lastPct = pct; }
    this.captionEl.hidden = false;
  }
}
