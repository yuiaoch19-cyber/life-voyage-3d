// 材质系统：影棚哑光 PBR（对标 Zygote Body / BioDigital）+ 可选的柔和 X 光模式
// 设计原则：不刺眼、看得清细节——所有"发光"只保留悬停描边
import * as THREE from 'three';
import { systemById, organById, type SystemDef } from '../state';

/* ---------- 共享剖切平面 ---------- */
export const clipPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);

/** 体格层 X 光模式（柔和版：轮廓微光，不再是"灯球"） */
export function makeXrayMaterial(color: string, base = 0.0004, strength = 0.16, power = 4.5) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uBase: { value: base },
      uStrength: { value: strength },
      uPow: { value: power },
      uOpacity: { value: 1 },
      uClipOn: { value: 0 },
      uClipPlane: { value: new THREE.Vector4(1, 0, 0, 0) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalW;
      varying vec3 vViewW;
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewW = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uBase, uStrength, uPow, uOpacity, uClipOn;
      uniform vec4 uClipPlane;
      varying vec3 vNormalW;
      varying vec3 vViewW;
      varying vec3 vWorldPos;
      void main() {
        if (uClipOn > 0.5 && dot(vWorldPos, uClipPlane.xyz) + uClipPlane.w < 0.0) discard;
        float f = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vViewW))), uPow);
        float a = (uBase + f * uStrength) * uOpacity;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
}

/** 体格层影棚实心材质（带可调不透明度，用于"实体"模式） */
export function makeSolidMaterials() {
  const mk = (color: string) => new THREE.MeshPhysicalMaterial({
    color, roughness: 0.58, metalness: 0.02, clearcoat: 0.18, clearcoatRoughness: 0.5,
    envMapIntensity: 0.55, transparent: true, opacity: 1, clippingPlanes: [clipPlane],
  });
  return { bone: mk('#e3ddcc'), muscle: mk('#9e4a42'), other: mk('#93a0b4') };
}

/** 器官材质：每器官专属色（organs.json 的 color 字段），湿润有机质感 */
export function makeOrganMaterial(organId: string, sys: SystemDef) {
  const def = organById.get(organId);
  const color = def?.color ?? sys.color;
  const m = new THREE.MeshPhysicalMaterial({
    color, roughness: 0.4, metalness: 0.0,
    clearcoat: 0.5, clearcoatRoughness: 0.32,
    sheen: 0.32, sheenRoughness: 0.55,
    sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.55),
    envMapIntensity: 0.55,
    transparent: true, opacity: 1,
    clippingPlanes: [clipPlane],
    emissive: new THREE.Color(color), emissiveIntensity: 0.0,
  });
  return m;
}

/** 皮肤材质 */
export function makeSkinMaterials() {
  return {
    solid: new THREE.MeshPhysicalMaterial({
      color: '#c9bfae', roughness: 0.65, metalness: 0.0, clearcoat: 0.1,
      envMapIntensity: 0.4, transparent: true, opacity: 1, clippingPlanes: [clipPlane],
    }),
    xray: makeXrayMaterial('#7dd3fc', 0.0003, 0.13, 4.6),
  };
}

/** 血管树管材（动脉深红 / 静脉灰蓝，半透明让粒子透出） */
export function makeVesselMaterials() {
  return {
    arterial: new THREE.MeshPhysicalMaterial({
      color: '#a03030', roughness: 0.45, metalness: 0.0, clearcoat: 0.3,
      transparent: true, opacity: 0.85, depthWrite: false,
      envMapIntensity: 0.35, clippingPlanes: [clipPlane],
    }),
    venous: new THREE.MeshPhysicalMaterial({
      color: '#46628f', roughness: 0.45, metalness: 0.0, clearcoat: 0.3,
      transparent: true, opacity: 0.55, depthWrite: false,
      envMapIntensity: 0.35, clippingPlanes: [clipPlane],
    }),
  };
}

/** 把剖切状态同步到 X 光材质 */
export function applyClipToXray(mats: THREE.ShaderMaterial[], on: boolean, plane: THREE.Plane) {
  for (const m of mats) {
    m.uniforms.uClipOn.value = on ? 1 : 0;
    (m.uniforms.uClipPlane.value as THREE.Vector4).set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
  }
}

export const systemColor = (id: string) => systemById.get(id as never)?.color ?? '#22d3ee';
