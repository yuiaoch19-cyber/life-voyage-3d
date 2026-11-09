// 生命奇旅 LifeVoyage — 主装配
import * as THREE from 'three';
import './ui/styles.css';
import { store, ORGANS, organById, systemById, enterMode, exitAllModes, onModeExit, addModeTimer, removeModeTimer } from './state';
import { CameraRig, HOME_POSITION, HOME_TARGET } from './scene/cameraRig';
import { setupLights } from './scene/lights';
import { PostFX } from './scene/postfx';
import {
  makeXrayMaterial, makeSolidMaterials, makeOrganMaterial, makeSkinMaterials,
  makeVesselMaterials, applyClipToXray, clipPlane,
} from './scene/materials';
import { loadAll } from './systems/loader';
import { Picking } from './systems/picking';
import { ParticleFlow, heartbeat, BLOOD_CURVES, NERVE_CURVES } from './systems/vessels';
import { ClipController } from './systems/clipping';
import { HeartSound } from './systems/audio';
import { FoodJourney } from './systems/food';
import { diseaseCfg, applyDiseaseMaterial, applyDiseaseScale, applyPlaqueMaterial, organShaderEntries, unregisterDiseaseUniforms, type DiseaseUniforms } from './scene/disease';
import { initLabels } from './systems/labels';
import * as quiz from './systems/quiz';
import { initNav } from './ui/nav';
import { initPanel, setDiseaseSlider, setDiseaseSliderDisabled } from './ui/panel';
import { initHud } from './ui/hud';
import { showTooltip, hideTooltip, initAbout, initEscDispatcher } from './ui/tooltip';
import { updateTweens } from './scene/tween';
import { deriveVisibility, classifyOrgan } from './systems/visibility';
import { selectOrgan, clearSelection } from './systems/selection';

/* ---------- 加载页文案（正能量，随进度轮换） ---------- */
const PHRASES = [
  '你今天会不自觉呼吸约 20,000 次——每一次都是身体在为你工作。',
  '你的心脏正以每分钟约 5 升的速度泵血，从不迟到，从不请假。',
  '如果把全身血管连起来，大约能绕地球两圈半。',
  '约 860 亿个神经元，正在陪你读完这句话。',
  '你的身体由约 37 万亿个细胞组成，它们只有一个目标：让你好好的。',
  '看懂它，才会珍惜它。马上就好……',
];

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const isMobile = window.matchMedia('(max-width: 900px)').matches;

/* ---------- 渲染基座 ---------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight); // 关键：初始化必须设一次，否则画布缓冲停在 300×150（模糊根因）
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.02, 60);
camera.position.set(0.9, 1.75, 4.8); // 开场远机位，加载完成后推入
const rig = new CameraRig(camera, canvas);
const { env: __env, key: keyLight } = setupLights(scene, renderer);

let postfx = new PostFX(scene, camera, renderer, window.innerWidth, window.innerHeight);

/* ---------- 材质 ---------- */
const xrayBody = makeXrayMaterial('#67e8f9');
  const flowXray = makeXrayMaterial('#3b82f6', 0.003, 0.35, 3.8); // 血流视图专用深蓝 X 光
const skinMats = makeSkinMaterials();
const solids = makeSolidMaterials();
const vascMats = makeVesselMaterials();
const organMats = new Map<string, THREE.MeshPhysicalMaterial>();

/* ---------- 粒子流：血液（暖红连续）+ 神经（亮黄波包） ---------- */
const vessels = new ParticleFlow(BLOOD_CURVES, { isMobile, density: 1.8 });
scene.add(vessels.points);
vessels.material.uniforms.uPointSize.value = renderer.getPixelRatio() * 0.85;
const nerveFlow = new ParticleFlow(NERVE_CURVES, {
  colorA: '#ffe066', colorB: '#ffd23e', speed: 0.5, pointScale: 0.95, packet: true, base: 0.7, isMobile,
});
scene.add(nerveFlow.points);
// 共用 shader 后颗粒基准变小，神经信号点略补回来，保持波包可辨识
nerveFlow.material.uniforms.uPointSize.value = renderer.getPixelRatio() * 1.3;

const clip = new ClipController();

// 调试钩子：仅开发模式注入（无头/截屏环境下 rAF 可能被挂起，可用 __lv.frame(n) 手动驱动）
if (import.meta.env.DEV) {
  Object.assign((window as unknown as Record<string, unknown>), {
    __lv: {
      renderer, scene, camera, xrayBody, skinMats, vessels, organMats, rig, store, nerveFlow,
      frame: null as null | ((n?: number, dt?: number) => void),
      setBodyOpacity: (v: number) => { xrayBody.uniforms.uOpacity.value = v; skinMats.xray.uniforms.uOpacity.value = v; },
    },
  });
}

/* ---------- 加载 UI ---------- */
const loadEl = document.getElementById('loading') as HTMLElement;
const barEl = document.getElementById('load-bar-fill') as HTMLElement;
const tipEl = document.getElementById('load-tip') as HTMLElement;
let phraseIdx = 0;
const phraseTimer = window.setInterval(() => { tipEl.textContent = PHRASES[phraseIdx++ % PHRASES.length]; }, 2600);

/** P0-1：加载失败展示同风格错误页（含重试），停掉轮播与遮罩 */
function showLoadError(err: unknown) {
  window.clearInterval(phraseTimer);
  loadEl.classList.add('done'); // 淡出遮罩
  window.setTimeout(() => {
    loadEl.replaceChildren();
    loadEl.className = '';
    loadEl.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:var(--bg,#0b1220);z-index:100';
    loadEl.innerHTML = `
      <div style="text-align:center;padding:2rem">
        <div style="font-size:28px;font-weight:700;letter-spacing:.1em;margin-bottom:12px">加载失败</div>
        <div style="font-size:13px;color:#94a3b8;margin-bottom:8px">${String(err).slice(0, 200) || '未知错误'}</div>
        <div style="font-size:12px;color:#64748b;margin-bottom:20px">请检查网络连接后重试</div>
        <button onclick="location.reload()" style="appearance:none;border:1px solid rgba(34,211,238,.5);background:rgba(34,211,238,.12);color:#22d3ee;font:inherit;font-size:14px;padding:10px 28px;border-radius:999px;cursor:pointer">重试</button>
      </div>`;
  }, 300);
}

/* ---------- 主流程 ---------- */
async function boot() {
  const loaded = await loadAll((frac, label) => {
    barEl.style.width = `${Math.round(frac * 100)}%`;
    tipEl.textContent = `${label} … ${Math.round(frac * 100)}%`;
  });
  scene.add(loaded.bodyRoot, loaded.organRoot);

  /* 器官材质 & 拾取注册 */
  const skinMeshes: THREE.Mesh[] = loaded.organMeshes.get('skin') ?? [];
  const vascGroup = (loaded.organRoot.userData['vasculature'] as THREE.Group | undefined) ?? null;
  const vascMeshes: THREE.Mesh[] = [];
  if (vascGroup) {
    vascGroup.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const kind = o.userData['vasculature'] === 'venous' ? 'venous' : 'arterial';
      o.material = vascMats[kind];
      o.renderOrder = 5;
      vascMeshes.push(o);
    });
  }
  const plaqueU = applyPlaqueMaterial(vascMats.arterial);
  const pickables: THREE.Mesh[] = [];
  for (const [organId, meshes] of loaded.organMeshes) {
    const def = organById.get(organId);
    for (const mesh of meshes) {
      if (organId === 'skin') {
        mesh.userData['skinRole'] = true;
        mesh.material = skinMats.solid;
      } else if (def) {
        const mat = makeOrganMaterial(organId, systemById.get(def.system)!);
        organMats.set(organId, mat);
        mesh.material = mat;
      }
      pickables.push(mesh);
    }
  }
  for (const { mesh } of loaded.bodyMeshes) mesh.material = solids.bone;
  const diaphragmBaseY = (loaded.organMeshes.get('diaphragm') ?? [])[0]?.position.y ?? 0;
  const nodeMeshes = [...loaded.organMeshes.entries()].filter(([id]) => id.startsWith('node-')).flatMap(([, ms]) => ms);

  /* 3D 标注 */
  const labels = initLabels(scene, document.getElementById('labels') as HTMLElement, loaded.organMeshes);
  labels.resize(window.innerWidth, window.innerHeight);

  /* 拾取 */
  const picking = new Picking(
    camera,
    canvas,
    (t, x, y) => {
      if (quiz.isActive()) { postfx.outline.selectedObjects = []; hideTooltip(); canvas.style.cursor = 'default'; return; }
      if (t && t.mesh.userData['pickable'] !== false) {
        postfx.outline.selectedObjects = [t.mesh];
        showTooltip(t.label, t.labelEn, x, y);
        canvas.style.cursor = 'pointer';
      } else {
        postfx.outline.selectedObjects = [];
        hideTooltip();
        canvas.style.cursor = 'grab';
      }
      store.set({ hovered: t?.organId ?? null });
    },
    (t) => {
      if (quiz.isActive()) { if (t?.organId) quiz.answer(t.organId); return; }
      if (!t || !t.organId) {
        if (store.s.touring) exitAllModes();
        clearSelection();
        return;
      }
      const id = t.organId;
      if (id.startsWith('node-')) nerveFlow.burst(1.0);
      selectOrgan(id, 'canvas');
    },
  );
  for (const mesh of pickables) {
    const id = mesh.userData['organId'] as string | undefined;
    const def = id ? organById.get(id) : undefined;
    picking.register(mesh, id ?? null, def?.nameZh ?? '', def?.nameEn);
  }
  for (const { mesh, info } of loaded.bodyMeshes) {
    picking.register(mesh, null, info.name || '人体结构');
  }

  const heartSound = new HeartSound();
  const foodJourney = new FoodJourney(
    document.getElementById('food-caption') as HTMLElement,
    isMobile,
  );
  scene.add(foodJourney.group);
  const heartMesh = (loaded.organMeshes.get('heart') ?? [])[0] ?? null;
  const lungMeshes = loaded.organMeshes.get('lungs') ?? [];
  const diaphragmMesh = (loaded.organMeshes.get('diaphragm') ?? [])[0] ?? null;
  let heartDiseaseS = 1; // 病变体积缩放系数（搏动乘在其上）
  let lungDiseaseS = 1;  // 吸烟肺病变缩放系数（呼吸涨缩乘在其上）
  const nervousMeshes: THREE.Mesh[] = [...loaded.organMeshes.entries()].filter(([id]) => id === 'nerves' || id.startsWith('node-')).flatMap(([, ms]) => ms);

  /* 健康对比（病变模拟）状态与回调 */
  const diseaseUniforms = new Map<string, DiseaseUniforms>();
  for (const [organId, mat] of organMats) {
    const def = organById.get(organId);
    const cfg = def ? diseaseCfg(def) : null;
    const du = applyDiseaseMaterial(mat, cfg, organId); // 全部器官打有机质感补丁；有配置的追加病变 uniforms
    if (cfg && du) diseaseUniforms.set(organId, du);
  }
  const onDiseaseChange = (id: string, v: number) => {
    const du = diseaseUniforms.get(id); const def = organById.get(id); const cfg = def ? diseaseCfg(def) : null;
    if (du) du.uDisease.value = v;
    if (cfg) for (const m of loaded.organMeshes.get(id) ?? []) applyDiseaseScale(m, cfg, v);
    if (id === 'heart' && plaqueU) plaqueU.uPlaque.value = v; // 动脉粥样硬化与心脏病变同步
    if (id === 'heart' && cfg) heartDiseaseS = 1 + (cfg.scale - 1) * v;
    if (id === 'lungs' && cfg) lungDiseaseS = 1 + (cfg.scale - 1) * v;
  };
  let compare: { id: string; clone: THREE.Mesh; origPos: THREE.Vector3; origScale: number; du: DiseaseUniforms | null } | null = null;
  const exitCompare = () => {
    if (!compare) return;
    const { id, clone, origPos, origScale, du } = compare;
    clone.removeFromParent();
    (clone.material as THREE.Material).dispose();
    const main = (loaded.organMeshes.get(id) ?? [])[0];
    if (main) { main.position.copy(origPos); main.scale.setScalar(origScale); }
    unregisterDiseaseUniforms(du);
    compare = null;
    setDiseaseSliderDisabled(false);
  };
  const onCompare = (id: string) => {
    if (compare?.id === id) {
      exitCompare();
      setDiseaseSlider(0);
      onDiseaseChange(id, 0);
      const def = organById.get(id)!;
      rig.flyTo(new THREE.Vector3(...def.camera.position), new THREE.Vector3(...def.camera.target));
      return;
    }
    exitCompare();
    const mesh = (loaded.organMeshes.get(id) ?? [])[0];
    const def = organById.get(id); const cfg = def ? diseaseCfg(def) : null; const mat = organMats.get(id);
    if (!mesh || !cfg || !mat) return;
    onDiseaseChange(id, 0);
    setDiseaseSlider(0);
    const bbox = new THREE.Box3().setFromObject(mesh);
    const size = bbox.getSize(new THREE.Vector3());
    const center = bbox.getCenter(new THREE.Vector3());
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const off = right.multiplyScalar(Math.max(size.x, size.y) * 0.62);
    const cloneMat = mat.clone();
    const du = applyDiseaseMaterial(cloneMat as THREE.MeshPhysicalMaterial, cfg, id);
    if (du) du.uDisease.value = 1;
    const clone = new THREE.Mesh(mesh.geometry, cloneMat);
    clone.position.copy(mesh.position).add(off);
    clone.renderOrder = mesh.renderOrder;
    scene.add(clone);
    const origPos = mesh.position.clone(); const origScale = mesh.scale.x;
    mesh.position.sub(off);
    compare = { id, clone, origPos, origScale, du };
    setDiseaseSliderDisabled(true);
    // 相机框住两者（注意：器官坐标烘在几何里，中点必须用包围盒中心）
    const mid = center.clone().add(off.clone().multiplyScalar(0.5));
    const dist = Math.max(size.x, size.y) * 2.6 + 0.2;
    rig.flyTo(mid.clone().add(new THREE.Vector3(0.15, 0.08, 1).normalize().multiplyScalar(dist)), mid, 1.1);
  };

  /* UI · 巡游（定时器统一交给模式仲裁器托管） */
  let tourTimer: number | undefined;
  let tourToken = 0;
  let tourQueue: string[] = [];
  let tourIdx = 0;
  // 章节巡游：?tour=blood | respiratory | nervous | random（默认随机）
  type TourChapter = 'random' | 'blood' | 'respiratory' | 'nervous';
  const CHAPTERS: TourChapter[] = ['random', 'blood', 'respiratory', 'nervous'];
  const chapterParam = new URLSearchParams(location.search).get('tour');
  let tourChapter: TourChapter = CHAPTERS.includes(chapterParam as TourChapter)
    ? (chapterParam as TourChapter) : 'random';
  let tourSetting = false; // 区分「巡游自己设置站点」与「用户手动选择」
  const setTourSite = (id: string) => {
    tourSetting = true;
    store.set({ selected: id });
    tourSetting = false;
  };
  const stopTour = () => {
    if (tourTimer !== undefined) {
      window.clearInterval(tourTimer);
      removeModeTimer(tourTimer);
      tourTimer = undefined;
    }
    tourToken++; // 使尚未执行的回调失效；状态由 enterMode 统一发布，避免重复通知
  };
  const shuffle = (a: string[]) => {
    const r = [...a];
    for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
    return r;
  };
  const startStopTour = () => {
    if (store.s.touring) { exitAllModes(); return; }
    enterMode('touring'); // 统一仲裁：自动停测验、退透视、清理遗留定时器
    const chapter = tourChapter;
    if (chapter === 'blood') store.set({ showBloodFlow: true });
    else if (chapter === 'nervous') store.set({ showNerveFlow: true });
    const base = chapter === 'blood' ? ['heart', 'lungs', 'liver', 'kidneys', 'brain']
      : chapter === 'respiratory' ? ['lungs', 'trachea-bronchi', 'diaphragm']
      : chapter === 'nervous' ? ['brain', 'node-spinal-cord', 'node-brachial-plexus', 'node-median-nerve', 'node-sciatic-nerve', 'node-vagus-nerve']
      : shuffle(ORGANS.filter((o) => o.id !== 'skin').map((o) => o.id));
    // 队列按当前系统过滤：否则站点会被立刻判定为「不属于该系统」而清空，
    // 出现「touring=true 但无字幕、相机不动」的空转。
    const sys = store.s.system;
    const inSystem = (id: string) => {
      if (sys === 'all') return true;
      const def = organById.get(id);
      return !!def && def.system === sys;
    };
    let queue = base.filter(inSystem);
    if (!queue.length) { store.set({ system: 'all' }); queue = base; } // 骨骼/肌肉等无器官系统回退全景
    tourQueue = queue;
    tourIdx = 0;
    tourToken++;
    const myToken = tourToken;
    tourTimer = window.setInterval(() => {
      if (myToken !== tourToken || !store.s.touring || tourTimer === undefined) return;
      tourIdx = (tourIdx + 1) % tourQueue.length;
      tourToken++;
      setTourSite(tourQueue[tourIdx]);
    }, 6500);
    addModeTimer(tourTimer, 'interval');
    setTourSite(queue[0]);
  };
  // 任何模式切换都先停巡游（测验/透视/回浏览），杜绝幽灵定时器
  onModeExit(() => { stopTour(); });
  // 巡游中用户手动选择器官 → 停止巡游。
  // 只认「选中了具体器官」，避免 enterMode('touring') 把 selected 清成 null 时误停自己。
  store.on((s, prev) => {
    if (s.touring && !tourSetting && s.selected && s.selected !== prev.selected) exitAllModes();
  });
  function takeScreenshot() {
    // A/B 对比模式下：导出「健康 | 病变」双格合成图
    if (compare) {
      const { id, clone } = compare;
      const mainMesh = (loaded.organMeshes.get(id) ?? [])[0];
      const shoot = (): string => {
        postfx.render(0);
        return (renderer.domElement as HTMLCanvasElement).toDataURL('image/png');
      };
      clone.visible = false; // 帧 A：健康
      const frameA = shoot();
      clone.visible = true; // 帧 B：病变
      const mainVis = mainMesh?.visible ?? true;
      if (mainMesh) mainMesh.visible = false;
      const frameB = shoot();
      if (mainMesh) mainMesh.visible = mainVis;
      const img1 = new Image();
      const img2 = new Image();
      let n = 0;
      const compose = () => {
        if (++n < 2) return;
        const w = renderer.domElement.width, h = renderer.domElement.height;
        const cnv = document.createElement('canvas');
        cnv.width = w * 2 + 8; cnv.height = h + 60;
        const ctx = cnv.getContext('2d')!;
        ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, cnv.width, cnv.height);
        ctx.drawImage(img1, 0, 60); ctx.drawImage(img2, w + 8, 60);
        ctx.fillStyle = '#e2e8f0'; ctx.font = '600 26px system-ui, sans-serif';
        ctx.fillText('健康', 26, 42);
        ctx.fillText('病变模拟', w + 34, 42);
        const a = document.createElement('a');
        a.href = cnv.toDataURL('image/png');
        a.download = `lifevoyage-ab-${id}.png`;
        a.click();
      };
      img1.onload = img2.onload = compose;
      img1.src = frameA; img2.src = frameB;
      return;
    }
    postfx.render(0); // 立即渲染一帧，保证合成拿到最新画面
    const src = renderer.domElement as HTMLCanvasElement;
    // alpha:true + 透明 clearColor 会导出透明底，而 CSS 极光层不在 canvas 内；
    // 与 A/B 合成路径一样先铺深空底色，导出的 PNG 才和屏幕观感一致。
    const out = document.createElement('canvas');
    out.width = src.width; out.height = src.height;
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, 0, 0);
    out.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `lifevoyage-${store.s.selected ?? 'overview'}.png`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  }
  // 巡游字幕
  const tourCaption = document.getElementById('tour-caption') as HTMLElement;
  store.on((s) => {
    if (s.touring && s.selected && s.system !== 'digestive') {
      const o = organById.get(s.selected);
      const idx = tourQueue.indexOf(s.selected);
      const first = (o?.summary ?? '').split('。')[0] + '。';
      tourCaption.hidden = false;
      tourCaption.innerHTML = '<b>' + (o?.nameZh ?? '') + '</b><span>' + first + '</span><i>' + (idx >= 0 ? idx + 1 : 1) + '/' + tourQueue.length + '</i>';
    } else {
      tourCaption.hidden = true;
    }
  });
  initNav();
  initPanel(
    () => { exitCompare(); clearSelection(); },
    { onDisease: onDiseaseChange, onCompare },
  );
  const hud = initHud(startStopTour, () => quiz.start(), takeScreenshot, () => { clearSelection(); rig.goHome(); });
  initAbout();
  // HUD 会随视口折行，把实测高度写进 CSS 变量，供左栏 / 面板 / 字幕计算 bottom，
  // 避免窄屏下 160px 高的 HUD 盖住字幕和面板底部。
  const syncHudHeight = () => {
    const el = document.getElementById('hud');
    if (el) document.documentElement.style.setProperty('--hud-h', `${Math.ceil(el.getBoundingClientRect().height)}px`);
  };
  syncHudHeight();
  // 折行、字体加载、视口变化都会改 HUD 高度，用 ResizeObserver 实时同步
  const hudEl = document.getElementById('hud');
  if (hudEl && 'ResizeObserver' in window) {
    new ResizeObserver(() => syncHudHeight()).observe(hudEl);
  }
  // P2-5 统一 Esc 分发器（层级：关于弹窗 → 测验 → 面板 → 巡游）
  initEscDispatcher({
    about: () => { const m = document.getElementById('about'); if (m && !m.hidden) { m.hidden = true; return true; } return false; },
    quiz: () => { if (quiz.isActive()) { exitAllModes(); return true; } return false; },
    panel: () => {
      const p = document.getElementById('panel');
      if (p && p.classList.contains('open')) { clearSelection(); return true; }
      if (store.s.selected) { clearSelection(); return true; }
      return false;
    },
    tour: () => { if (store.s.touring) { exitAllModes(); return true; } return false; },
  });

  /* 状态 → 场景：显示决策全部来自 visibility.ts，这里只把它们应用到 three 对象 */
  const applyState = (s: typeof store.s, prev: Partial<typeof store.s>) => {
    const vis = deriveVisibility(s);

    /* 体格层：每次全量同步，不再用字符串缓存键（漏一个维度就会让整个视图失效） */
    const useFlow = vis.body.mode === 'flow';
    const bodyVisible = vis.body.visible;
    const op = vis.body.opacity;
    for (const { mesh, info } of loaded.bodyMeshes) {
      mesh.visible = bodyVisible;
      if (!bodyVisible) continue;
      if (vis.body.typeFilter === 'bone') {
        mesh.visible = info.type === 'bone' || info.type === 'other';
        mesh.material = solids.bone;
      } else if (vis.body.typeFilter === 'muscle') {
        mesh.visible = info.type === 'muscle' || info.type === 'other';
        mesh.material = solids.muscle;
      } else if (useFlow || s.bodyMode === 'xray') {
        mesh.material = useFlow ? flowXray : xrayBody;
      } else {
        mesh.material = info.type === 'bone' ? solids.bone : info.type === 'muscle' ? solids.muscle : solids.other;
      }
    }
    for (const m of [solids.bone, solids.muscle, solids.other]) {
      m.opacity = useFlow ? 0.04 : op;
      m.depthWrite = !useFlow && op > 0.8;
    }
    for (const mesh of skinMeshes) {
      mesh.visible = vis.skin.visible;
      mesh.material = s.bodyMode === 'xray' ? skinMats.xray : skinMats.solid;
      mesh.userData['pickable'] = vis.skin.pickable;
    }
    for (const { mesh } of loaded.bodyMeshes) mesh.userData['pickable'] = vis.body.pickable;
    skinMats.solid.opacity = useFlow ? 0.02 : op * 0.55;
    skinMats.solid.depthWrite = !useFlow && op * 0.55 > 0.8;
    xrayBody.uniforms.uOpacity.value = useFlow ? 0.08 : op;
    skinMats.xray.uniforms.uOpacity.value = useFlow ? 0.048 : op;
    flowXray.uniforms.uOpacity.value = useFlow ? 0.06 : op;

    if (s.system !== prev.system) rig.goHome();
    // 换器官：清掉上一个器官的病变状态与对比克隆（只在选中变化时）
    if (s.selected !== prev.selected) {
      exitCompare();
      setDiseaseSlider(0);
      if (prev.selected) onDiseaseChange(prev.selected, 0);
    }
    // 器官显示优先级：每次状态变化全量同步。
    // 不再用「哪些字段变了才重算」的缓存键——v9.6 的 modeKey 漏 system、
    // 这次的缓存键漏 soloIsolate / quizActive，都是同一类病，直接从根上消除。
    for (const [organId, mat] of organMats) {
      const v = classifyOrgan(s, organId);
      mat.visible = v.visible;
      mat.opacity = v.opacity;
      mat.depthWrite = v.depthWrite;
      mat.emissiveIntensity = 0;
      meshPickable(loaded, organId, v.pickable);
    }
    for (const mesh of skinMeshes) {
      mesh.userData['pickable'] = vis.skin.pickable;
      mesh.visible = vis.skin.visible;
    }
    if (s.selected && s.selected !== prev.selected) {
      const def = organById.get(s.selected)!;
      rig.flyTo(new THREE.Vector3(...def.camera.position), new THREE.Vector3(...def.camera.target));
    }

    // 剖切
    if (s.clip !== prev.clip || s.clipPos !== prev.clipPos) {
      const { on, plane } = clip.setMode(s.clip, s.clipPos);
      applyClipToXray([xrayBody, skinMats.xray, flowXray], on, plane);
      for (const mat of organMats.values()) mat.clippingPlanes = on ? [clipPlane] : null;
      skinMats.solid.clippingPlanes = on ? [clipPlane] : null;
      solids.bone.clippingPlanes = solids.muscle.clippingPlanes = solids.other.clippingPlanes = on ? [clipPlane] : null;
      vascMats.arterial.clippingPlanes = vascMats.venous.clippingPlanes = on ? [clipPlane] : null;
      vessels.applyClip(on);
      nerveFlow.applyClip(on);
    }

    // 血管 / 粒子 / 神经 / 标注 / 食物：全部按 deriveVisibility 的决策应用
    for (const m of vascMeshes) {
      m.visible = vis.vesselWall.visible;
      // 透明度来自 deriveVisibility（聚焦时作为空间参照淡化），视图层不再硬编码覆盖
      (m.material as THREE.MeshPhysicalMaterial).opacity = vis.vesselWall.opacity * (m.userData.vasculature === 'venous' ? 0.65 : 1);
    }
    vessels.setFlowVisible(vis.bloodFlow.visible);
    vessels.material.depthTest = vis.bloodFlow.depthTest;
    vessels.material.uniforms.uPointSize.value = renderer.getPixelRatio() * vis.bloodFlow.pointSize;
    vessels.material.uniforms.uOpacity.value = vis.bloodFlow.opacity;
    vessels.material.uniforms.uSpeed.value = 0.3 * s.flowSpeed;
    nerveFlow.material.uniforms.uSpeed.value = 0.5 * s.flowSpeed;
    for (const m of nervousMeshes) {
      const isNet = (m.userData.name || m.name) === 'o.nerves';
      if (!isNet) continue; // 节点球由器官循环管理
      m.visible = vis.nerveNet.visible;
      (m.material as THREE.MeshPhysicalMaterial).opacity = vis.nerveNet.opacity;
    }
    nerveFlow.points.visible = vis.nerveFlow.visible;
    foodJourney.setVisible(vis.food.visible);
    labels.setVisible(vis.labels.visible);
  };
  store.on(applyState);
  // 启动时强制应用一次初始状态（哨兵 prev 让每个分支都跑一遍）
  applyState(store.s, {
    bodyMode: '__init__' as never, selected: '__init__' as never, system: '__init__' as never, showOrgans: '__init__' as never,
    clip: '__init__' as never, clipPos: -1,
  });

  function meshPickable(loaded2: typeof loaded, organId: string, pickable: boolean) {
    for (const mesh of loaded2.organMeshes.get(organId) ?? []) mesh.userData['pickable'] = pickable;
  }

  /* 完成加载 */
  window.clearInterval(phraseTimer);
  barEl.style.width = '100%';
  setTimeout(() => {
    loadEl.classList.add('done');
    rig.flyTo(HOME_POSITION, HOME_TARGET, 1.6);
  }, 350);
  setTimeout(() => loadEl.remove(), 1400);

  /* 主循环（rAF 暂停的环境可用 __lv.frame(n) 手动驱动） */
  const clock = new THREE.Clock();
  let elapsed = 0;
  let loopFrame = 0;
  const keyDirView = new THREE.Vector3();
  const frame = (dtIn?: number) => {
    const dt = dtIn ?? Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    updateTweens(dt);
    rig.update(dt);
    vessels.update(dt, heartbeat(elapsed, store.s.bpm));
    nerveFlow.update(dt, 0.3 + (store.s.system === 'nervous' ? 0.18 : 0));
    foodJourney.update(dt);
    const nodePulse = 1 + 0.16 * Math.sin(elapsed * 3.2);
    for (const nm of nodeMeshes) nm.scale.setScalar(nodePulse);
    const pulse = heartbeat(elapsed, store.s.bpm);
    hud.setPulse(pulse);
    // P0-A 心脏搏动：包络乘在病变缩放之上（枢轴已重定向，原地搏动）
    if (heartMesh) heartMesh.scale.setScalar(heartDiseaseS * (1 - 0.04 * pulse));
    // P0-B 呼吸节律：14 次/分，肺涨缩与膈肌下沉反相（与心跳独立节律）
    const breath = 0.5 - 0.5 * Math.cos((elapsed * 14 / 60) * Math.PI * 2);
    for (const m of lungMeshes) m.scale.setScalar(lungDiseaseS * (1 + 0.025 * breath));
    if (diaphragmMesh) diaphragmMesh.position.y = diaphragmBaseY - 0.008 * breath;
    heartSound.tick(pulse, store.s.bpm, elapsed);
    // 肉感管线：主灯方向逐帧同步到视图空间
    if (organShaderEntries.length) {
      keyDirView.copy(keyLight.position).normalize().transformDirection(camera.matrixWorldInverse);
      for (const e of organShaderEntries) e.u.uKeyDirView.value.copy(keyDirView);
    }
    if ((loopFrame++ & 1) === 0) {
      const occ = pickables.filter((m) => m.visible && (m.material as THREE.Material).visible);
      labels.update(camera, occ);
    }
    postfx.render(dt);
  };
  renderer.setAnimationLoop(() => frame());
  if (import.meta.env.DEV) {
    ((window as unknown as Record<string, unknown>)['__lv'] as { frame: unknown })['frame'] =
      (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) frame(dt); };
  }

  canvas.addEventListener('dblclick', () => {
    if (store.s.touring) exitAllModes();
    clearSelection(); // 同时退出 solo 隔离与 A/B 对比
    rig.goHome();
  });

  /* 自适应 */
  window.addEventListener('resize', () => {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    postfx.resize(w, h);
    labels.resize(w, h);
    syncHudHeight();
  });
}

boot().catch((err) => {
  console.error(err);
  showLoadError(err);
});
