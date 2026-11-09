// 相机 rigs：轨道控制 + 相机飞行（器官机位）
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { tween, cancelTween, type Tween } from './tween';

export const HOME_POSITION = new THREE.Vector3(0, 1.05, 3.15);
export const HOME_TARGET = new THREE.Vector3(0, 0.93, 0);

export class CameraRig {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  private flight: Tween | null = null;

  constructor(camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, dom);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.22;
    this.controls.maxDistance = 7;
    this.controls.maxPolarAngle = Math.PI * 0.92;
    this.controls.target.copy(HOME_TARGET);
    // 用户一上手就取消自动飞行，避免"抢方向盘"
    this.controls.addEventListener('start', () => cancelTween(this.flight));
  }

  flyTo(position: THREE.Vector3Like, target: THREE.Vector3Like, dur = 1.15) {
    cancelTween(this.flight);
    const p0 = this.camera.position.clone();
    const p1 = new THREE.Vector3(position.x, position.y, position.z);
    const t0 = this.controls.target.clone();
    const t1 = new THREE.Vector3(target.x, target.y, target.z);
    this.flight = tween(dur, (k) => {
      this.camera.position.lerpVectors(p0, p1, k);
      this.controls.target.lerpVectors(t0, t1, k);
    });
  }

  goHome(dur = 1.15) { this.flyTo(HOME_POSITION, HOME_TARGET, dur); }

  update(dt: number) {
    this.controls.update();
    void dt;
  }

  dispose() { this.controls.dispose(); }
}
