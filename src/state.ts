// 全局状态与系统定义（单一事实来源，UI 与 3D 都订阅它）
import organsJson from './data/organs.json';
import nervesJson from './data/nerves.json';

export type SystemId =
  | 'all' | 'circulatory' | 'respiratory' | 'digestive' | 'nervous'
  | 'urinary' | 'immune' | 'integumentary' | 'skeletal' | 'muscular';

export interface SystemDef { id: SystemId; label: string; color: string; }

export const SYSTEMS: SystemDef[] = [
  { id: 'all', label: '全部', color: '#22d3ee' },
  { id: 'circulatory', label: '循环', color: '#f87171' },
  { id: 'respiratory', label: '呼吸', color: '#38bdf8' },
  { id: 'digestive', label: '消化', color: '#fbbf24' },
  { id: 'nervous', label: '神经', color: '#a78bfa' },
  { id: 'urinary', label: '泌尿', color: '#34d399' },
  { id: 'immune', label: '免疫', color: '#fb923c' },
  { id: 'integumentary', label: '体表', color: '#e2e8f0' },
  { id: 'skeletal', label: '骨骼', color: '#e3ddcc' },
  { id: 'muscular', label: '肌肉', color: '#c96f5f' },
];
export const systemById = new Map(SYSTEMS.map((s) => [s.id, s]));

export interface DiseaseDef {
  name: string; color: string; spotColor: string;
  displace: number; noiseScale: number; spotDensity: number; scale: number;
  changes: string[]; reversible: string; reference: string;
}

export interface OrganDef {
  id: string; nameZh: string; nameEn: string; system: Exclude<SystemId, 'all' | 'skeletal' | 'muscular'>;
  color?: string; disease?: DiseaseDef;
  summary: string; structure: string[];
  facts: { text: string; reference: string }[];
  careTips: string[];
  camera: { position: [number, number, number]; target: [number, number, number] };
}
export const ORGANS: OrganDef[] = [
  ...((organsJson as unknown as { organs: OrganDef[] }).organs),
  ...((nervesJson as unknown as { nodes: OrganDef[] }).nodes),
];
export const organById = new Map(ORGANS.map((o) => [o.id, o]));

export type BodyMode = 'xray' | 'solid' | 'hidden';
export type ClipMode = 'off' | 'sagittal' | 'coronal';

export interface AppState {
  system: SystemId;
  selected: string | null;   // 选中器官 id（选中即隔离：隐藏体格层与其它器官）
  hovered: string | null;    // 悬停器官 id
  bodyMode: BodyMode;        // 体格层：X 光 / 实体 / 隐藏
  bloodSolo: boolean;        // 透视视图：隐藏一切，只留幽灵轮廓 + 粒子流
  showOrgans: boolean;       // 器官层
  showVessels: boolean;      // 血管管壁
  showBloodFlow: boolean;    // 血流粒子流（与血管管壁独立开关）
  showNerves: boolean;       // 神经网
  showNerveFlow: boolean;    // 神经信号粒子流（与神经网独立开关）
  showLabels: boolean;       // 3D 标注
  soloIsolate: boolean;      // 选中时是否隔离（同系统淡化、跨系统隐藏）
  xrayStrength: number;      // 0..1 体格层不透明度/强度
  flowSpeed: number;         // 0.1..2.5 粒子流速倍率（血+神经共用）
  clip: ClipMode;
  clipPos: number;           // 0..1
  bpm: number;               // 50..120
  touring: boolean;          // 自动巡游讲解
  quizActive: boolean;       // 测验模式进行中
}

type Listener = (s: AppState, prev: AppState) => void;

/**
 * 聚焦（选中隔离）唯一谓词：与四种模式正交的一根轴。
 * 定义在 state.ts 而非 visibility.ts，避免「visibility 引用 state、state 又引用 visibility」的循环依赖。
 * 所有决策（器官优先级 / 体格层 / 粒子流 / 控件三态 / 模式说明）都必须引用它，
 * 不得再各自写 `!!s.selected`。
 */
export function focusActive(s: AppState): boolean {
  return !!s.selected && s.soloIsolate && !s.quizActive && !s.bloodSolo && !s.touring;
}

/** 聚焦期间临时收起粒子流的快照；用户手动调整过则作废，退出时尊重其新选择 */
type FocusSnapshot = Pick<AppState, 'showBloodFlow' | 'showNerveFlow'>;
let focusSnapshot: FocusSnapshot | null = null;

class Store {
  private subs = new Set<Listener>();
  s: AppState = {
    system: 'all', selected: null, hovered: null,
    bodyMode: 'solid', bloodSolo: false,
    showOrgans: true, showVessels: true, showBloodFlow: false, showNerves: true, showNerveFlow: false, showLabels: true,
    soloIsolate: true,
    xrayStrength: 0.6,
    flowSpeed: 0.6,
    clip: 'off', clipPos: 0.5,
    bpm: 72, touring: false, quizActive: false,
  };
  set(patch: Partial<AppState>) {
    // 推荐值 5：切系统时若已选中器官不属于新系统，自动保持在它所属的系统，
    // 而不是悄悄取消选中。放在 Store 层一次性规范化，避免订阅者重入；
    // nav.ts 会检测「实际系统 ≠ 点击的系统」并给出提示。
    if (patch.system !== undefined && patch.system !== this.s.system) {
      const sel = patch.selected !== undefined ? patch.selected : this.s.selected;
      if (sel && patch.system !== 'all') {
        const def = organById.get(sel);
        if (def && def.system !== patch.system) patch = { ...patch, system: def.system };
      }
    }
    // 聚焦进出的一次性规范化：所有入口（左栏 / 搜索 / 3D 点选 / Esc / 关面板 /
    // 重置视角 / 巡游 / 切换「选中隔离」）都经过这里，避免漏路径导致状态撕裂。
    // 进入聚焦时把血流 / 神经信号开关临时置为关闭态（UI 同步显示已收起），退出时恢复。
    const wasFocus = focusActive(this.s);
    const draft = { ...this.s, ...patch };
    const nowFocus = focusActive(draft);
    if (!wasFocus && nowFocus) {
      focusSnapshot = { showBloodFlow: draft.showBloodFlow, showNerveFlow: draft.showNerveFlow };
      if (draft.showBloodFlow) patch = { ...patch, showBloodFlow: false };
      if (draft.showNerveFlow) patch = { ...patch, showNerveFlow: false };
    } else if (wasFocus && !nowFocus) {
      const snap = focusSnapshot;
      focusSnapshot = null;
      // enterMode 的图层快照若已显式指定这两个值，则以它为准（不重复覆盖）。
      if (snap && patch.showBloodFlow === undefined && draft.showBloodFlow === false && snap.showBloodFlow) {
        patch = { ...patch, showBloodFlow: true };
      }
      if (snap && patch.showNerveFlow === undefined && draft.showNerveFlow === false && snap.showNerveFlow) {
        patch = { ...patch, showNerveFlow: true };
      }
    } else if (wasFocus && nowFocus && (patch.showBloodFlow !== undefined || patch.showNerveFlow !== undefined)) {
      // 聚焦期间用户手动再打开/关闭粒子流：显式意图优先，退出聚焦后保持新选择
      focusSnapshot = null;
    }

    // 浅比较：值未变不通知（防止 pointermove 等高频写入触发全量订阅者重跑）
    const keys = Object.keys(patch) as (keyof AppState)[];
    let changed = false;
    for (const k of keys) { if (this.s[k] !== patch[k]) { changed = true; break; } }
    if (!changed) return;
    const prev = this.s;
    this.s = { ...prev, ...patch };
    for (const fn of this.subs) fn(this.s, prev);
  }
  on(fn: Listener) { this.subs.add(fn); return () => this.subs.delete(fn); }
}

export const store = new Store();

/* ---------- 模式仲裁（透视 / 巡游 / 测验 互斥） ---------- */
export type AppMode = 'browse' | 'touring' | 'quiz' | 'bloodSolo';

type TimerKind = 'interval' | 'timeout';
const modeTimers = new Map<number, TimerKind>();
const exitHooks = new Set<(next: AppMode) => void>();

/** 注册「离开当前模式」钩子：各模块在此收尾自己的内部状态与 DOM */
export function onModeExit(fn: (next: AppMode) => void) {
  exitHooks.add(fn);
  return () => exitHooks.delete(fn);
}

/** 把定时器交给仲裁器托管，切换模式时自动清理 */
export function addModeTimer(id: number, kind: TimerKind = 'interval') { modeTimers.set(id, kind); }
export function removeModeTimer(id: number) { modeTimers.delete(id); }
export function clearModeTimers() {
  for (const [id, kind] of modeTimers) {
    if (kind === 'timeout') window.clearTimeout(id);
    else window.clearInterval(id);
  }
  modeTimers.clear();
}

/** 进入模式前的图层开关快照，退出模式时恢复，而不是强制重置 */
type LayerSnapshot = Pick<AppState,
  'showOrgans' | 'showVessels' | 'showBloodFlow' | 'showNerves' | 'showNerveFlow' | 'showLabels' | 'bodyMode' | 'xrayStrength'>;
let layerSnapshot: LayerSnapshot | null = null;
function captureLayers(): LayerSnapshot {
  const s = store.s;
  return {
    showOrgans: s.showOrgans, showVessels: s.showVessels, showBloodFlow: s.showBloodFlow,
    showNerves: s.showNerves, showNerveFlow: s.showNerveFlow, showLabels: s.showLabels,
    bodyMode: s.bodyMode, xrayStrength: s.xrayStrength,
  };
}

/** 进入某模式前退出其它互斥模式；返回是否实际切换 */
export function enterMode(mode: AppMode): boolean {
  const s = store.s;
  if (mode === 'touring' && s.touring) return false;
  if (mode === 'quiz' && s.quizActive) return false;
  if (mode === 'bloodSolo' && s.bloodSolo) return false;
  const wasBrowse = !s.touring && !s.quizActive && !s.bloodSolo;
  if (mode !== 'browse' && wasBrowse) layerSnapshot = captureLayers();
  // 顺序：先让各模块收尾（quiz.stop / stopTour），再清定时器，最后发布状态。
  // 这样模块内部状态（q.active、横幅、quiz-lock）与 store 永远一致。
  for (const fn of exitHooks) fn(mode);
  clearModeTimers();
  if (mode === 'browse') {
    const restore = layerSnapshot;
    layerSnapshot = null;
    store.set({ touring: false, quizActive: false, bloodSolo: false, ...(restore ?? {}) });
    return true;
  }
  if (mode === 'touring') {
    store.set({ touring: true, quizActive: false, bloodSolo: false, selected: null });
    return true;
  }
  if (mode === 'quiz') {
    store.set({ quizActive: true, touring: false, bloodSolo: false, selected: null });
    return true;
  }
  store.set({ bloodSolo: true, touring: false, quizActive: false, selected: null, showBloodFlow: true });
  return true;
}

export function exitAllModes() { enterMode('browse'); }
