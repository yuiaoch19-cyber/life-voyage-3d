// 显示决策的单一真相源：所有「谁能显示 / 谁被接管 / 控件能不能点」都在这里推导。
// 纯函数，不依赖 three 对象，便于表驱动测试。
import { organById, systemById, focusActive, type AppState, type AppMode, type BodyMode } from '../state';

export type ControlId =
  | 'mode-browse' | 'blood-solo' | 'btn-tour' | 'btn-quiz' | 'mode-exit'
  | 'body-layer-toggle' | 'body-mode' | 'opacity'
  | 'organs-toggle' | 'solo-toggle'
  | 'vessel-layer-toggle' | 'vessels-toggle' | 'bloodflow-toggle' | 'flow-speed'
  | 'nerve-layer-toggle' | 'nerves-toggle' | 'nerveflow-toggle'
  | 'labels-toggle'
  | 'clip-mode' | 'clip-pos' | 'bpm'
  | 'btn-shot' | 'btn-reset' | 'btn-about'
  | 'system-switch' | 'nav' | 'search';

export interface ControlState {
  state: 'on' | 'off' | 'locked';
  checked?: boolean;
  reason?: string;
}

export interface OrganVisual {
  visible: boolean;
  opacity: number;
  depthWrite: boolean;
  pickable: boolean;
  reason: string;
}

export interface VisibilityPlan {
  body: { visible: boolean; mode: BodyMode | 'flow'; opacity: number; pickable: boolean; typeFilter: 'all' | 'bone' | 'muscle'; reason: string };
  skin: { visible: boolean; pickable: boolean; reason: string };
  vesselWall: { visible: boolean; opacity: number; reason: string };
  bloodFlow: { visible: boolean; opacity: number; pointSize: number; depthTest: boolean; reason: string };
  nerveNet: { visible: boolean; opacity: number; reason: string };
  nerveFlow: { visible: boolean; reason: string };
  labels: { visible: boolean; reason: string };
  food: { visible: boolean; reason: string };
}

/** 三个布尔标志显式化为唯一模式（互斥由 enterMode 保证） */
export function getMode(s: AppState): AppMode {
  if (s.quizActive) return 'quiz';
  if (s.bloodSolo) return 'bloodSolo';
  if (s.touring) return 'touring';
  return 'browse';
}

function booleanControl(checked: boolean): ControlState {
  return { state: checked ? 'on' : 'off', checked };
}
function locked(reason: string, checked?: boolean): ControlState {
  return { state: 'locked', reason, checked };
}

/** 当前模式的说明（模式条 + 汇总原因，用户不必逐个 hover 才知道为什么不能点） */
export function modeNotice(s: AppState): { label: string; detail: string; canExit: boolean } {
  const mode = getMode(s);
  if (mode === 'quiz') return { label: '测验', detail: '请在 3D 模型上点选作答；左栏、搜索与图层暂不可用', canExit: true };
  if (mode === 'bloodSolo') return { label: '透视', detail: '仅显示血流与半透明轮廓；体格层与血流由模式接管，器官 / 标注 / 神经暂不可用', canExit: true };
  if (mode === 'touring') return { label: '巡游', detail: '正在自动讲解；点击器官或左栏会停止巡游', canExit: true };
  // 聚焦是正交轴、不是第 5 种模式：不锁控件，但必须给出可见的退出入口
  if (focusActive(s)) {
    const name = organById.get(s.selected!)?.nameZh ?? '器官';
    const flowReopened = s.showBloodFlow || s.showNerveFlow;
    return {
      label: '聚焦',
      detail: flowReopened
        ? `已聚焦${name}（选中隔离）· 粒子流已按你的选择重新开启（降亮）；图层开关可随时调整，点「退出聚焦」或 Esc 返回`
        : `已聚焦${name}（选中隔离）· 体格层与参照层淡化、粒子流暂时收起；图层开关仍可调整，点「退出聚焦」或 Esc 返回`,
      canExit: true,
    };
  }
  if (s.selected) return { label: '浏览', detail: '已选中器官（选中隔离已关闭），所有图层可自由调整', canExit: true };
  if (s.system !== 'all') return { label: '浏览', detail: `当前筛选：${systemById.get(s.system)?.label ?? ''}系统，仅相关图层可用`, canExit: false };
  return { label: '浏览', detail: '可自由调整图层与参数', canExit: false };
}

/** 单个器官的显示分类（选中优先级表 P4） */
export function classifyOrgan(s: AppState, organId: string): OrganVisual {
  const def = organById.get(organId);
  const selected = s.selected === organId;
  const isNerveNet = organId === 'nerves';
  const nerveCtx = !!s.selected && (s.selected.startsWith('node-') || s.selected === 'brain' || s.selected === 'nerves');
  const ctxKeep = isNerveNet && nerveCtx;
  const inSystem = s.system === 'all' || def?.system === s.system;
  // 「同系统」按选中器官所属系统判断：即使顶栏处于「全部」，
  // 选中胃时也应淡化其它消化器官、隐藏循环/呼吸等无关系统的器官。
  const selectedDef = s.selected ? organById.get(s.selected) : null;
  const sameAsSelection = !selectedDef?.system || def?.system === selectedDef.system;
  const bloodHide = s.bloodSolo && !ctxKeep;
  const layerOff = !s.showOrgans && !isNerveNet;
  const solo = !!s.selected;
  const focus = focusActive(s);
  const mode = getMode(s);

  if (bloodHide) return { visible: false, opacity: 0, depthWrite: false, pickable: false, reason: '透视视图隐藏器官' };
  if (layerOff) return { visible: false, opacity: 0, depthWrite: false, pickable: false, reason: '器官图层已关闭' };
  if (selected) return { visible: true, opacity: 1, depthWrite: true, pickable: true, reason: '选中器官（最高优先级）' };
  if (ctxKeep) return { visible: true, opacity: 0.9, depthWrite: true, pickable: false, reason: '选中内容的空间参照' };
  if (mode === 'quiz') return { visible: inSystem, opacity: inSystem ? 1 : 0.08, depthWrite: false, pickable: inSystem, reason: '测验题目目标' };
  if (focus) {
    // 推荐值 3：同系统其它器官淡化到 12%，保留空间感；跨系统隐藏
    if (inSystem && sameAsSelection) return { visible: true, opacity: 0.12, depthWrite: false, pickable: false, reason: '选中隔离 · 同系统淡化' };
    return { visible: false, opacity: 0, depthWrite: false, pickable: false, reason: '选中隔离 · 跨系统隐藏' };
  }
  if (inSystem) return { visible: true, opacity: 1, depthWrite: !solo, pickable: !solo && mode === 'browse', reason: '当前系统' };
  return { visible: false, opacity: 0.08, depthWrite: false, pickable: false, reason: '非当前系统' };
}

/** 其余图层的显示决策 */
export function deriveVisibility(s: AppState): VisibilityPlan {
  const mode = getMode(s);
  const circOK = s.system === 'all' || s.system === 'circulatory';
  const nervOK = s.system === 'all' || s.system === 'nervous';
  const forceSkeletal = s.system === 'skeletal';
  const forceMuscular = s.system === 'muscular';
  const useFlow = mode === 'bloodSolo';
  const focus = focusActive(s);
  // 聚焦时体格层由「隐藏」改为淡化：用户仍可用 X 光 / 实体 / 透明滑杆看到变化，
  // 避免「体格层控件被锁」这种能锁整片 UI 却没有出口的准模式。
  const bodyVisible = s.bodyMode !== 'hidden';

  return {
    body: {
      visible: bodyVisible,
      mode: useFlow ? 'flow' : s.bodyMode,
      // 用比例衰减而非上限截断：透明滑杆在聚焦时依然每一格都有可见效果
      opacity: useFlow ? 0.08 : focus ? s.xrayStrength * 0.3 : s.xrayStrength,
      pickable: s.system !== 'nervous',
      typeFilter: forceSkeletal ? 'bone' : forceMuscular ? 'muscle' : 'all',
      reason: useFlow ? '透视轮廓（模式接管）' : focus ? '聚焦中体格层淡化（仍可调整）' : s.bodyMode === 'hidden' ? '体格层已隐藏' : '体格层',
    },
    skin: {
      visible: bodyVisible && !forceSkeletal && !forceMuscular,
      pickable: (s.system === 'all' || s.system === 'integumentary') && s.showOrgans,
      reason: '皮肤（体表）',
    },
    vesselWall: {
      visible: s.showVessels && circOK && mode !== 'bloodSolo',
      // 聚焦时血管壁作为空间参照保留但淡化（优先级表第 2 级）
      opacity: focus ? 0.22 : 0.85,
      reason: mode === 'bloodSolo' ? '透视下隐藏血管壁' : focus ? '聚焦 · 血管壁作为空间参照淡化' : circOK ? '血管管壁' : '当前系统不含循环内容',
    },
    bloodFlow: {
      // 进入聚焦时 Store 会把开关置为关闭态（UI 同步显示已收起）；
      // 若用户在聚焦期间手动再打开，显式意图优先：显示但降亮，不压过所选器官。
      visible: (s.showBloodFlow && circOK) || mode === 'bloodSolo',
      opacity: mode === 'bloodSolo' ? 0.42 : focus ? 0.3 : 0.78,
      pointSize: mode === 'bloodSolo' ? 1.35 : focus ? 0.7 : 0.85,
      depthTest: !(mode === 'bloodSolo' || s.showBloodFlow),
      reason: mode === 'bloodSolo' ? '透视强制显示血流' : focus ? '聚焦 · 用户手动开启血流（降亮）' : circOK ? '血流粒子' : '当前系统不含循环内容',
    },
    nerveNet: {
      visible: s.showNerves && nervOK && mode !== 'bloodSolo',
      opacity: focus ? 0.2 : s.system === 'nervous' ? 0.9 : 0.45,
      reason: mode === 'bloodSolo' ? '透视下隐藏神经网' : focus ? '聚焦 · 神经网作为空间参照淡化' : nervOK ? '神经网' : '当前系统不含神经内容',
    },
    nerveFlow: {
      visible: s.showNerveFlow && (nervOK || mode === 'bloodSolo') && mode !== 'bloodSolo',
      reason: mode === 'bloodSolo' ? '透视下隐藏信号粒子' : nervOK ? '神经信号粒子' : '当前系统不含神经内容',
    },
    labels: {
      visible: s.showLabels && mode !== 'quiz' && mode !== 'bloodSolo',
      reason: mode === 'quiz' ? '测验中禁用标注以防提示答案' : mode === 'bloodSolo' ? '透视下隐藏标注' : '3D 标注',
    },
    food: {
      visible: s.system === 'digestive' && mode !== 'bloodSolo',
      reason: '消化系统食物之旅',
    },
  };
}

/** 控件三态：任何被接管的控件都必须给出原因，禁止「能点但没反应」 */
export function controlState(id: ControlId, s: AppState): ControlState {
  const mode = getMode(s);
  const vis = deriveVisibility(s);
  const circOK = s.system === 'all' || s.system === 'circulatory';
  const nervOK = s.system === 'all' || s.system === 'nervous';
  const organOK = s.system === 'all' || (s.system !== 'skeletal' && s.system !== 'muscular');

  // 模式条与一次性动作：始终可用
  if (['mode-browse', 'blood-solo', 'btn-tour', 'btn-quiz', 'mode-exit', 'btn-shot', 'btn-reset', 'btn-about', 'bpm', 'clip-mode'].includes(id)) {
    return { state: 'on' };
  }

  if (mode === 'quiz') {
    return locked('测验中暂不可用，结束测验后恢复');
  }

  switch (id) {
    case 'clip-pos':
      return s.clip === 'off' ? locked('请先选择矢状或冠状剖切', false) : { state: 'on' };

    // 聚焦（选中隔离）不锁任何控件：体格层改为淡化、粒子流临时收起但开关仍可点，
    // 因此每个开关在聚焦态下依然有可见效果。唯一能接管控件的是 L0 模式与系统筛选。
    case 'body-layer-toggle':
    case 'body-mode':
    case 'opacity':
      if (mode === 'bloodSolo') return locked('透视视图下体格层固定为半透明轮廓', true);
      return id === 'body-layer-toggle' ? booleanControl(s.bodyMode !== 'hidden') : { state: 'on' };

    case 'organs-toggle':
      if (mode === 'bloodSolo') return locked('透视视图下器官已隐藏', false);
      if (!organOK) return locked('当前系统不含器官内容', false);
      return booleanControl(s.showOrgans);

    case 'solo-toggle':
      if (mode !== 'browse') return locked('仅在浏览模式下可调整选中隔离', s.soloIsolate);
      return booleanControl(s.soloIsolate);

    case 'vessel-layer-toggle':
    case 'vessels-toggle':
    case 'bloodflow-toggle':
      if (mode === 'bloodSolo') return locked(id === 'bloodflow-toggle' ? '透视视图强制显示血流' : '透视视图下血管壁已隐藏', id === 'bloodflow-toggle');
      if (!circOK) return locked('当前系统不含循环系统内容', false);
      if (id === 'vessel-layer-toggle') return booleanControl(s.showVessels || s.showBloodFlow);
      return booleanControl(id === 'vessels-toggle' ? s.showVessels : s.showBloodFlow);

    case 'flow-speed':
      if (!vis.bloodFlow.visible && !vis.nerveFlow.visible) return locked('先开启「血流粒子」或「神经信号粒子」');
      return { state: 'on' };

    case 'nerve-layer-toggle':
    case 'nerves-toggle':
    case 'nerveflow-toggle':
      if (mode === 'bloodSolo') return locked('透视视图下神经内容已隐藏', false);
      if (!nervOK) return locked('当前系统不含神经内容', false);
      if (id === 'nerve-layer-toggle') return booleanControl(s.showNerves || s.showNerveFlow);
      return booleanControl(id === 'nerves-toggle' ? s.showNerves : s.showNerveFlow);

    case 'labels-toggle':
      if (mode === 'bloodSolo') return locked('透视视图下标注已隐藏', false);
      return booleanControl(s.showLabels);

    case 'system-switch':
    case 'nav':
    case 'search':
      return { state: 'on' };

    default:
      return { state: 'on' };
  }
}
