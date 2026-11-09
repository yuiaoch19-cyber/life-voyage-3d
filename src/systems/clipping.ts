// 剖切：sagittal（x）与 coronal（z）平面，位置可拖动；同步给所有材质
import * as THREE from 'three';
import { clipPlane } from '../scene/materials';

export class ClipController {
  mode: 'off' | 'sagittal' | 'coronal' = 'off';
  pos = 0.5; // 0..1 → 归一化平面位置

  setMode(mode: 'off' | 'sagittal' | 'coronal', pos: number): { on: boolean; plane: THREE.Plane } {
    this.mode = mode;
    this.pos = pos;
    return this.sync();
  }

  /** 更新平面常量；返回 {on, plane} 供各材质同步 */
  sync(): { on: boolean; plane: THREE.Plane } {
    if (this.mode === 'off') { clipPlane.constant = 0; return { on: false, plane: clipPlane }; }
    const isSagittal = this.mode === 'sagittal';
    clipPlane.normal.set(isSagittal ? 1 : 0, 0, isSagittal ? 0 : 1);
    // 保留系数 = -dot(point, normal)：法线方向一侧保留，另一侧剖掉
    const span = isSagittal ? 0.36 : 0.22; // 身体半宽/半厚
    const c = (this.pos * 2 - 1) * span;
    clipPlane.constant = c;
    return { on: true, plane: clipPlane };
  }
}
