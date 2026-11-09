// 粒子流系统（泛化）：血液=暖红连续流，神经=亮黄波包脉冲
// 路径来源：手写主干 + BP3D 自动中心线（血） / ZA 神经部件中心线（神经）
import * as THREE from 'three';
import vesselsJson from '../data/vessels.json';
import vesselsAutoJson from '../data/vessels-auto.json';
import nervePathsJson from '../data/nerve-paths.json';
import { clipPlane } from '../scene/materials';

interface CurveDef { id: string; type: 'artery' | 'vein'; label: string; count: number; size: number; points: [number, number, number][]; }
const AUTHORED = (vesselsJson as unknown as { curves: CurveDef[] }).curves;
const AUTO = (vesselsAutoJson as unknown as { curves: CurveDef[] }).curves;
export const BLOOD_CURVES: CurveDef[] = [...AUTHORED, ...AUTO];
export const NERVE_CURVES: CurveDef[] = (nervePathsJson as unknown as { curves: CurveDef[] }).curves;

const SAMPLES = 256;

/** 心跳包络：0..1，含"快-慢-歇"的主-次搏动 */
export function heartbeat(time: number, bpm: number) {
  const ph = ((time * bpm) / 60) % 1;
  const v = Math.exp(-9 * ph) + 0.45 * Math.exp(-9 * Math.abs(ph - 0.38));
  return Math.min(1, v / 1.45);
}

export interface FlowStyle {
  colorA: string;   // 主色（动脉/神经）
  colorB: string;   // 次色（静脉/分支）
  speed: number;    // 曲线/秒
  pointScale: number;
  packet: boolean;  // 波包节律（神经信号）vs 连续流（血液）
  base: number;     // 基础亮度脉冲下限
  density: number;  // 粒子数倍率（相对 JSON 里的 count）
}

const DEFAULT_STYLE: FlowStyle = { colorA: '#ff5147', colorB: '#d13a3a', speed: 0.3, pointScale: 1.2, packet: false, base: 0.85, density: 1 };

export class ParticleFlow {
  points: THREE.Points;
  material: THREE.ShaderMaterial;
  private time = 0;
  private burstV = 0;

  constructor(curves: CurveDef[], style: Partial<FlowStyle> & { isMobile?: boolean } = {}) {
    const st = { ...DEFAULT_STYLE, ...style };
    const rows = curves.length;
    const width = SAMPLES;
    const texData = new Uint16Array(width * rows * 4);
    const curve = new THREE.CatmullRomCurve3([], false, 'catmullrom', 0.2);

    curves.forEach((c, row) => {
      curve.points = c.points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
      const pts = curve.getSpacedPoints(width - 1);
      pts.forEach((p, i) => {
        const o = (row * width + i) * 4;
        texData[o] = THREE.DataUtils.toHalfFloat(p.x);
        texData[o + 1] = THREE.DataUtils.toHalfFloat(p.y);
        texData[o + 2] = THREE.DataUtils.toHalfFloat(p.z);
        texData[o + 3] = THREE.DataUtils.toHalfFloat(1);
      });
    });

    const tex = new THREE.DataTexture(texData, width, rows, THREE.RGBAFormat, THREE.HalfFloatType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.needsUpdate = true;

    // 密度倍率统一在这里生效，避免直接改资产 JSON；移动端仍减半但基数随密度提升
    const countOf = (c: CurveDef) => Math.max(1, Math.round(c.count * st.density * (st.isMobile ? 0.5 : 1)));
    const total = curves.reduce((s, c) => s + countOf(c), 0);
    const aT = new Float32Array(total);
    const aRow = new Float32Array(total);
    const aColor = new Float32Array(total * 3);
    const aSize = new Float32Array(total);
    const aPhase = new Float32Array(total);
    const positions = new Float32Array(total * 3);
    const color = new THREE.Color();

    let k = 0;
    curves.forEach((c, row) => {
      const n = countOf(c);
      color.set(c.type === 'artery' ? st.colorA : st.colorB);
      for (let i = 0; i < n; i++, k++) {
        // 沿曲线等间距播种：随机 aT 会一开始就出现团块与空洞，
        // 叠加流速差后越跑越结块。只加极小的抖动保留自然感。
        aT[k] = (i + 0.5) / n + (Math.random() - 0.5) * (0.3 / n);
        aRow[k] = row;
        aColor[k * 3] = color.r; aColor[k * 3 + 1] = color.g; aColor[k * 3 + 2] = color.b;
        aSize[k] = c.size * (0.85 + Math.random() * 0.3);
        aPhase[k] = Math.random() * Math.PI * 2;
      }
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
    geo.setAttribute('aRow', new THREE.BufferAttribute(aRow, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(aColor, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(aPhase, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 2.5);

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true, // v2 决议：粒子嵌入血管树内部，被前景器官正确遮挡（透视视图下由 applyState 临时关闭）
      blending: THREE.NormalBlending, // v2 决议：禁用 additive，红光叠在亮青色上会被稀释成白色
      uniforms: {
        uMap: { value: tex },
        uRows: { value: rows },
        uTime: { value: 0 },
        uPulse: { value: 0 },
        uPointSize: { value: 1.4 },
        uOpacity: { value: 1 },
        uSpeed: { value: st.speed },
        uPacket: { value: st.packet ? 1 : 0 },
        uClipOn: { value: 0 },
        uClipPlane: { value: new THREE.Vector4(1, 0, 0, 0) },
      },
      vertexShader: /* glsl */ `
        attribute float aT, aRow, aSize, aPhase;
        attribute vec3 aColor;
        uniform sampler2D uMap;
        uniform float uRows, uTime, uPulse, uPointSize, uSpeed, uPacket; // uPacket 必须声明，否则整个 shader 编译失败、粒子全灭
        varying vec3 vColor;
        varying float vAlpha;
        varying vec3 vWorldPos;
        uniform float uClipOn;
        uniform vec4 uClipPlane;
        float hash(float n) { return fract(sin(n) * 43758.5453); }
        void main() {
          // 速度差按「曲线」而非「粒子」：同一条血管内所有粒子同速，
          // 等间距播种才不会随时间被拉散、结成一团。曲线之间仍保留轻微速度差。
          float rowSpeed = 0.9 + 0.2 * hash(aRow * 1.37 + 0.5);
          float beat = 0.86 + 0.28 * uPulse; // 心跳节奏更柔和，不再忽快忽慢
          float t = fract(aT + uTime * uSpeed * rowSpeed * beat);
          vec3 p = texture2D(uMap, vec2(t, (aRow + 0.5) / uRows)).xyz;
          float h = hash(aPhase * 17.0);
          p += (vec3(hash(h + 1.0), hash(h + 2.0), hash(h + 3.0)) - 0.5) * 0.003;
          vWorldPos = p;
          vColor = aColor;
          float pulseBoost = 0.92 + 0.16 * uPulse; // 心跳只轻微影响大小
          float taper = 1.0 - 0.18 * t;
          // 神经：波包节律（信号成簇传导）；血液：连续流
          float lvPacket = mix(1.0, pow(0.5 + 0.5 * sin(uTime * 5.1 + aRow * 1.31 + aPhase * 0.15), 3.0) * 1.5 + 0.1, step(0.5, uPacket));
          // 等间距 + 同速流动虽然不结块，但看起来像一条静止的线。
          // 叠加沿曲线推进的亮度带，让血流方向可被眼睛感知；神经已有波包，不再重复调制。
          float wave = 0.8 + 0.2 * sin(6.2831853 * (t * 2.5 - uTime * uSpeed * 2.5));
          float bloodWave = mix(wave, 1.0, step(0.5, uPacket));
          vAlpha = (0.72 + 0.12 * uPulse) * lvPacket * bloodWave * smoothstep(0.0, 0.02, t) * (1.0 - smoothstep(0.98, 1.0, t));
          // 视空间 z 为负（相机看向 -z），先取负再 max，否则除以 -0.0001 得负点尺寸 → GPU 不光栅化
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = min(11.0, uPointSize * aSize * pulseBoost * taper * (12.0 / max(0.0001, -mvPosition.z)));
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        varying vec3 vWorldPos;
        uniform float uOpacity, uClipOn;
        uniform vec4 uClipPlane;
    void main() {
      if (uClipOn > 0.5 && dot(vWorldPos, uClipPlane.xyz) + uClipPlane.w < 0.0) discard;
      vec2 d = gl_PointCoord - 0.5;
      float r = length(d);
      if (r > 0.5) discard;
      float a = smoothstep(0.5, 0.14, r) * vAlpha * uOpacity;
      // 去掉近白色高光核心：中心最多比原色亮 12%，始终是血管红，
      // 透视模式下大量粒子叠加也不会泛白。
      vec3 col = vColor * (1.0 + 0.12 * (1.0 - smoothstep(0.0, 0.28, r)));
      gl_FragColor = vec4(col, a);
    }
      `,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.points.name = 'particleFlow';
  }

  update(dt: number, pulse: number) {
    this.time += dt;
    this.burstV = Math.max(0, this.burstV - dt * 0.7);
    this.material.uniforms.uTime.value = this.time;
    this.material.uniforms.uPulse.value = Math.min(1.2, pulse + this.burstV);
  }

  setPulse(p: number) { this.material.uniforms.uPulse.value = p; }
  burst(strength = 1) { this.burstV = Math.min(1.4, this.burstV + strength); }
  setFlowVisible(on: boolean) { this.points.visible = on; this.material.uniforms.uOpacity.value = on ? 1 : 0; }
  setOpacity(v: number) { this.material.uniforms.uOpacity.value = v; }
  applyClip(on: boolean) {
    this.material.uniforms.uClipOn.value = on ? 1 : 0;
    (this.material.uniforms.uClipPlane.value as THREE.Vector4).set(clipPlane.normal.x, clipPlane.normal.y, clipPlane.normal.z, clipPlane.constant);
  }
}
