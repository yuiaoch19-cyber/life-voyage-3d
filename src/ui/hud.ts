// 底部控制台：L0 模式条 / L1-L3 图层域 / 特别功能区
// 所有控件的可用性由 visibility.controlState 统一推导，禁止「能点但没反应」
import { store, enterMode, exitAllModes, focusActive, type AppMode, type AppState, type BodyMode, type ClipMode } from '../state';
import { controlState, modeNotice, getMode, type ControlId, type ControlState } from '../systems/visibility';
import { clearSelection } from '../systems/selection';

const CONTROL_IDS: ControlId[] = [
  'body-layer-toggle', 'body-mode', 'opacity',
  'organs-toggle', 'solo-toggle',
  'vessel-layer-toggle', 'vessels-toggle', 'bloodflow-toggle', 'flow-speed',
  'nerve-layer-toggle', 'nerves-toggle', 'nerveflow-toggle',
  'labels-toggle', 'clip-mode', 'clip-pos', 'bpm',
  'btn-shot', 'btn-reset', 'system-switch', 'nav', 'search',
];

function targetsOf(id: string, root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  // 分段控件是容器，锁定状态要落到内部每个按钮
  if (id === 'body-mode' || id === 'clip-mode') return [...root.querySelectorAll<HTMLButtonElement>('button')];
  return [root];
}

/** 这些控件是容器（没有 disabled 属性），锁定时必须连子元素一起失去交互与焦点 */
const CONTAINER_IDS = new Set<ControlId>(['system-switch', 'nav', 'search']);

function applyControl(id: ControlId, root: HTMLElement | null, cs: ControlState, baseTitles: Map<string, string>) {
  const locked = cs.state === 'locked';
  for (const el of targetsOf(id, root)) {
    if ('disabled' in el) (el as HTMLButtonElement).disabled = locked;
    if (CONTAINER_IDS.has(id)) el.toggleAttribute('inert', locked);
    el.classList.toggle('is-locked', locked);
    el.setAttribute('aria-disabled', String(locked));
    if (cs.checked !== undefined) el.setAttribute('aria-checked', String(cs.checked));
    if (id.endsWith('-toggle')) el.classList.toggle('on', cs.checked === true);
    if (locked) el.title = cs.reason ?? '当前不可用';
    else {
      const base = baseTitles.get(id);
      if (base) el.title = base; else el.removeAttribute('title');
    }
  }
}

export function initHud(onTour: () => void, onQuiz: () => void, onShot: () => void, onReset: () => void) {
  const $ = (id: string) => document.getElementById(id) as HTMLElement | null;
  const bodyModeEl = $('body-mode');
  const clipModeEl = $('clip-mode');
  const opacityEl = $('opacity') as HTMLInputElement | null;
  const clipPosEl = $('clip-pos') as HTMLInputElement | null;
  const bpmEl = $('bpm') as HTMLInputElement | null;
  const bpmVal = $('bpm-val') as HTMLOutputElement | null;
  const bloodSoloEl = $('blood-solo') as HTMLButtonElement | null;
  const flowSpeedEl = $('flow-speed') as HTMLInputElement | null;
  const tourEl = $('btn-tour') as HTMLButtonElement | null;
  const quizEl = $('btn-quiz') as HTMLButtonElement | null;
  const shotEl = $('btn-shot') as HTMLButtonElement | null;
  const heartEl = $('heart-pulse');

  // 记录原始 title，解锁后还原（避免把原因文案永久留在控件上）
  const baseTitles = new Map<string, string>();
  for (const id of CONTROL_IDS) {
    const t = $(id)?.title;
    if (t) baseTitles.set(id, t);
  }
  for (const id of ['blood-solo', 'btn-tour', 'btn-quiz', 'btn-shot', 'btn-reset']) {
    const t = $(id)?.title;
    if (t) baseTitles.set(id, t);
  }

  /* ---- 动态分段控件 ---- */
  const bodyModes: { id: BodyMode; label: string }[] = [
    { id: 'xray', label: 'X 光' }, { id: 'solid', label: '实体' }, { id: 'hidden', label: '隐藏' },
  ];
  const bodyBtns = new Map<BodyMode, HTMLButtonElement>();
  for (const m of bodyModes) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = m.label;
    b.addEventListener('click', () => store.set({ bodyMode: m.id }));
    bodyModeEl?.appendChild(b);
    bodyBtns.set(m.id, b);
  }
  const clipModes: { id: ClipMode; label: string }[] = [
    { id: 'off', label: '关' }, { id: 'sagittal', label: '矢状' }, { id: 'coronal', label: '冠状' },
  ];
  const clipBtns = new Map<ClipMode, HTMLButtonElement>();
  for (const m of clipModes) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = m.label;
    b.addEventListener('click', () => store.set({ clip: m.id }));
    clipModeEl?.appendChild(b);
    clipBtns.set(m.id, b);
  }

  /* ---- L0 模式条 ---- */
  const modeBtns: Partial<Record<AppMode, HTMLElement | null>> = {
    browse: $('mode-browse'), bloodSolo: bloodSoloEl, touring: tourEl, quiz: quizEl,
  };
  const noticeEl = $('mode-notice');
  const exitEl = $('mode-exit') as HTMLButtonElement | null;
  // 聚焦与模式正交，但同样需要一个可见出口：退出按钮同时清掉选中
  const goBrowse = () => { exitAllModes(); clearSelection(); };
  $('mode-browse')?.addEventListener('click', goBrowse);
  exitEl?.addEventListener('click', goBrowse);
  bloodSoloEl?.addEventListener('click', () => {
    if (store.s.bloodSolo) goBrowse(); else enterMode('bloodSolo');
  });
  tourEl?.addEventListener('click', onTour);
  quizEl?.addEventListener('click', onQuiz);
  shotEl?.addEventListener('click', onShot);
  $('btn-reset')?.addEventListener('click', onReset);

  /* ---- L1 域主开关（批量控制本域子开关，联动可见） ---- */
  $('body-layer-toggle')?.addEventListener('click', () => {
    store.set({ bodyMode: store.s.bodyMode === 'hidden' ? 'solid' : 'hidden' });
  });
  $('vessel-layer-toggle')?.addEventListener('click', () => {
    const on = !(store.s.showVessels || store.s.showBloodFlow);
    store.set({ showVessels: on, showBloodFlow: on });
  });
  $('nerve-layer-toggle')?.addEventListener('click', () => {
    const on = !(store.s.showNerves || store.s.showNerveFlow);
    store.set({ showNerves: on, showNerveFlow: on });
  });
  $('organs-toggle')?.addEventListener('click', () => store.set({ showOrgans: !store.s.showOrgans }));
  $('labels-toggle')?.addEventListener('click', () => store.set({ showLabels: !store.s.showLabels }));
  $('solo-toggle')?.addEventListener('click', () => store.set({ soloIsolate: !store.s.soloIsolate }));

  /* ---- L2 / L3 与特别功能 ---- */
  $('vessels-toggle')?.addEventListener('click', () => store.set({ showVessels: !store.s.showVessels }));
  $('bloodflow-toggle')?.addEventListener('click', () => store.set({ showBloodFlow: !store.s.showBloodFlow }));
  $('nerves-toggle')?.addEventListener('click', () => store.set({ showNerves: !store.s.showNerves }));
  $('nerveflow-toggle')?.addEventListener('click', () => store.set({ showNerveFlow: !store.s.showNerveFlow }));
  opacityEl?.addEventListener('input', () => store.set({ xrayStrength: opacityEl.valueAsNumber / 100 }));
  clipPosEl?.addEventListener('input', () => store.set({ clipPos: clipPosEl.valueAsNumber / 100 }));
  flowSpeedEl?.addEventListener('input', () => store.set({ flowSpeed: flowSpeedEl.valueAsNumber / 100 }));
  bpmEl?.addEventListener('input', () => {
    if (bpmVal) bpmVal.textContent = bpmEl.value;
    store.set({ bpm: bpmEl.valueAsNumber });
  });

  /* ---- 状态 → 控件三态 ---- */
  const sync = (s: AppState) => {
    for (const id of CONTROL_IDS) applyControl(id, $(id), controlState(id, s), baseTitles);
    for (const [id, b] of bodyBtns) b.classList.toggle('on', s.bodyMode === id);
    for (const [id, b] of clipBtns) b.classList.toggle('on', s.clip === id);
    if (opacityEl) opacityEl.value = String(Math.round(s.xrayStrength * 100));
    if (flowSpeedEl) flowSpeedEl.value = String(Math.round(s.flowSpeed * 100));
    if (bpmVal) bpmVal.textContent = String(s.bpm);

    const mode = getMode(s);
    for (const [key, el] of Object.entries(modeBtns)) el?.classList.toggle('on', key === mode);
    const notice = modeNotice(s);
    if (noticeEl) noticeEl.textContent = `${notice.label} · ${notice.detail}`;
    if (exitEl) {
      exitEl.hidden = !notice.canExit;
      exitEl.textContent = focusActive(s) ? '退出聚焦' : s.selected ? '取消选中' : '退出当前模式';
    }
    // 模式条也标注被接管的原因，用户不用逐个 hover
    if (mode === 'quiz' || mode === 'bloodSolo' || mode === 'touring') {
      exitEl?.setAttribute('title', notice.detail);
    }
  };
  // store.on 只在 set 时触发；启动时主动同步一次，保证初始 disabled / 原因文案就位
  sync(store.s);
  store.on(sync);

  return {
    setPulse(p: number) { if (heartEl) heartEl.style.transform = `scale(${(1 + 0.32 * p).toFixed(3)})`; },
  };
}
