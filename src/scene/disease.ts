// 病变模拟：把健康器官"连续地"变成不爱护它的样子
// 只做颜色/斑点/凹凸/体积四类变化，遵守全站"无惊悚"红线；教育性模拟，非诊断
import * as THREE from 'three';
import type { OrganDef } from '../state';

export interface DiseaseCfg {
  name: string;
  color: string; spotColor: string;
  displace: number; noiseScale: number; spotDensity: number;
  scale: number; // 病变态体积倍率（肿大/缩小）
  changes: string[];
  reversible: string;
  reference: string;
}

export const diseaseCfg = (def: OrganDef): DiseaseCfg | null => (def as unknown as { disease?: DiseaseCfg }).disease ?? null;

/* ---- GLSL：两阶 value noise（顶点位移与斑点共用） ---- */
const NOISE_GLSL = /* glsl */ `
float lvHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float lvNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(lvHash(i), lvHash(i + vec3(1, 0, 0)), f.x), mix(lvHash(i + vec3(0, 1, 0)), lvHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(lvHash(i + vec3(0, 0, 1)), lvHash(i + vec3(1, 0, 1)), f.x), mix(lvHash(i + vec3(0, 1, 1)), lvHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
`;

export interface DiseaseUniforms {
  uDisease: { value: number };
  uDiseaseColor: { value: THREE.Color };
  uSpotColor: { value: THREE.Color };
  uSpotDensity: { value: number };
  uDisplace: { value: number };
  uNoiseScale: { value: number };
  uTranslucency: { value: number };
  uTintAmt: { value: number };
  uTintScale: { value: number };
  uSeedOff: { value: number };
  uCavityAmt: { value: number };
  uKeyDirView: { value: THREE.Vector3 };
  uKeyColor: { value: THREE.Color };
}

// 各器官的"厚度感"（透光强度）——薄壁器官透光更强
const TRANSLUCENCY: Record<string, number> = {
  lungs: 0.5, stomach: 0.4, kidneys: 0.32, 'ureters-bladder': 0.3,
  liver: 0.26, spleen: 0.3, pancreas: 0.3, heart: 0.16,
};
const DEFAULT_TRANSLUCENCY = 0.25;

// 已打补丁的器官材质登记表（主循环逐帧更新主灯方向）
// 无病变配置的器官也要登记：肉感管线的透光方向依赖 uKeyDirView。
type KeyDirUniform = Pick<DiseaseUniforms, 'uKeyDirView'>;
export const organShaderEntries: { u: KeyDirUniform }[] = [];

/** 反注册：A/B 对比克隆销毁时移除，避免登记表只增不减 */
export function unregisterDiseaseUniforms(u: DiseaseUniforms | null) {
  if (!u) return;
  const i = organShaderEntries.findIndex((e) => e.u === u);
  if (i >= 0) organShaderEntries.splice(i, 1);
}

const hashSeed = (id: string) => { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 997; return h; };

/**
 * 器官材质统一着色器补丁：
 * - 全部器官：肉感管线（wrap 等效软填充 + 薄壁透光 + 组织色斑 + 腔隙 AO + 噪声粗糙度）
 * - 有 disease 配置：追加病变位移 / 斑点 / 变色 uniforms
 * 返回病变 uniforms 句柄（无配置时返回 null）
 */
export function applyDiseaseMaterial(mat: THREE.MeshPhysicalMaterial, cfg: DiseaseCfg | null, organId: string): DiseaseUniforms | null {
  // 基础肉感参数必须无条件注入：fragment shader 里 uTranslucency / uTintAmt /
  // uCavityAmt / uKeyDirView 等始终被使用，缺失时全部为 0，软填充与透光会失效。
  const base = {
    uTranslucency: { value: TRANSLUCENCY[organId] ?? DEFAULT_TRANSLUCENCY },
    uTintAmt: { value: 0.32 },
    uTintScale: { value: 13 + (hashSeed(organId) % 90) / 10 },
    uSeedOff: { value: hashSeed(organId) * 1.37 },
    uCavityAmt: { value: 0.3 },
    uKeyDirView: { value: new THREE.Vector3(0.4, 0.8, 0.5) },
    uKeyColor: { value: new THREE.Color('#fff4e6').multiplyScalar(0.55) },
  };
  const uniforms: DiseaseUniforms | null = cfg ? {
    uDisease: { value: 0 },
    uDiseaseColor: { value: new THREE.Color(cfg.color) },
    uSpotColor: { value: new THREE.Color(cfg.spotColor) },
    uSpotDensity: { value: cfg.spotDensity },
    uDisplace: { value: cfg.displace },
    uNoiseScale: { value: cfg.noiseScale },
    ...base,
  } : null;
  organShaderEntries.push({ u: uniforms ?? base });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, base);
    if (uniforms) Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 lvWp;
${NOISE_GLSL}${uniforms ? `
uniform float uDisease;
uniform float uDisplace;
uniform float uNoiseScale;` : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 lvW = modelMatrix * vec4(position, 1.0);
        lvWp = lvW.xyz;${uniforms ? `
        float lvN = lvNoise(lvWp * uNoiseScale) * 0.65 + lvNoise(lvWp * uNoiseScale * 2.7) * 0.35;
        transformed += normal * (lvN - 0.5) * uDisplace * uDisease;` : ''}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 lvWp;
${NOISE_GLSL}${uniforms ? `
uniform float uDisease;
uniform vec3 uDiseaseColor;
uniform vec3 uSpotColor;
uniform float uSpotDensity;
uniform float uNoiseScale;` : ''}
uniform float uTranslucency;
uniform float uTintAmt;
uniform float uTintScale;
uniform float uSeedOff;
uniform float uCavityAmt;
uniform vec3 uKeyDirView;
uniform vec3 uKeyColor;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        // 有机微质感：噪声调制粗糙度，摆脱均匀塑料感
        float lvMicro = lvNoise(lvWp * 26.0) * 0.6 + lvNoise(lvWp * 61.0) * 0.4;
        roughnessFactor = clamp(roughnessFactor * (0.82 + 0.36 * lvMicro), 0.12, 0.95);`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // 组织色斑：真实组织的颜色从不均匀
        float lvTint = lvNoise(lvWp * uTintScale + uSeedOff) * 0.6 + lvNoise(lvWp * uTintScale * 0.43 + uSeedOff * 1.7) * 0.4;
        diffuseColor.rgb *= (1.0 - uTintAmt) + uTintAmt * (0.82 + 0.36 * lvTint);${uniforms ? `
        float lvSpot = step(1.0 - uSpotDensity, lvNoise(lvWp * uNoiseScale * 3.1 + 17.0));
        vec3 lvDiseased = mix(uDiseaseColor, uSpotColor, lvSpot * 0.85);
        diffuseColor.rgb = mix(diffuseColor.rgb, lvDiseased, uDisease);` : ''}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        {
          // 软填充（wrap diffuse 的等效项）：把暗部抬起来，明暗过渡变"肉"
          float lvSoft = saturate((dot(geometryNormal, normalize(vec3(0.25, 0.7, 0.45))) + 0.4) / 1.4);
          reflectedLight.indirectDiffuse += uKeyColor * 0.14 * lvSoft * BRDF_Lambert(material.diffuseColor);
          // 腔隙 AO：高频噪声的暗缝，给表面凹凸以深度
          float lvCav = mix(1.0, lvNoise(lvWp * 9.0) * 0.6 + lvNoise(lvWp * 19.0) * 0.4, uCavityAmt);
          reflectedLight.indirectDiffuse *= lvCav;
          // 薄壁透光（Jimenez 透射近似）：逆光时薄边缘微微透亮
          vec3 lvV = normalize(geometryViewDir);
          vec3 lvH = normalize(-uKeyDirView + lvV * 0.55);
          float lvTr = pow(saturate(dot(lvV, -lvH)), 4.0);
          reflectedLight.indirectDiffuse += uKeyColor * (lvTr * uTranslucency) * material.diffuseColor;
        }`);
  };
  mat.customProgramCacheKey = () => 'organ-patch' + (cfg ? '-d-' + cfg.name : '');
  return uniforms;
}

/** 动脉斑块（动脉粥样硬化）：黄斑 + 内壁隆起，强度与心脏病变滑杆联动 */
export interface PlaqueUniforms {
  uPlaque: { value: number };
  uPlaqueColor: { value: THREE.Color };
}
export function applyPlaqueMaterial(mat: THREE.MeshPhysicalMaterial): PlaqueUniforms {
  const u: PlaqueUniforms = { uPlaque: { value: 0 }, uPlaqueColor: { value: new THREE.Color('#d9c06e') } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uPlaque;\nvarying vec3 lvWp;\n${NOISE_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 lvW = modelMatrix * vec4(position, 1.0);
        lvWp = lvW.xyz;
        float lvN = lvNoise(lvWp * 5.0) * 0.65 + lvNoise(lvWp * 13.0) * 0.35;
        transformed += normal * (lvN - 0.35) * 0.0016 * uPlaque;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uPlaque;\nuniform vec3 uPlaqueColor;\nvarying vec3 lvWp;\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float lvPlq = smoothstep(0.45, 0.75, lvNoise(lvWp * 4.0 + 31.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, uPlaqueColor, lvPlq * uPlaque);`);
  };
  mat.customProgramCacheKey = () => 'artery-plaque';
  return u;
}

/** 体积变化：mesh.scale = 基准 × lerp(1, cfg.scale, t) */
export function applyDiseaseScale(mesh: THREE.Object3D, cfg: DiseaseCfg, t: number) {
  const s = 1 + (cfg.scale - 1) * t;
  mesh.scale.setScalar(s);
}
