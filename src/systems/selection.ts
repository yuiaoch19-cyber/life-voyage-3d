// 选中的唯一入口：左栏、搜索、3D 点选、巡游都走这里，保证五种模式下行为一致
import { store, exitAllModes, organById, focusActive } from '../state';
import { getMode } from './visibility';
import { showToast } from '../ui/toast';

export type SelectSource = 'nav' | 'search' | 'canvas' | 'tour' | 'api';

export function selectOrgan(id: string, _source: SelectSource = 'api') {
  const mode = getMode(store.s);
  // 推荐值 4：测验中禁止左栏/搜索选中，明确提示改用 3D 点选作答
  if (mode === 'quiz') {
    showToast('测验中请在 3D 模型上点选作答');
    return;
  }
  // 推荐值：透视 / 巡游中点击器官，先退出该模式并说明，而不是"点了没反应"
  if (mode === 'bloodSolo') {
    exitAllModes();
    showToast(`已退出透视，定位到 ${organById.get(id)?.nameZh ?? '器官'}`);
  } else if (mode === 'touring') {
    exitAllModes();
    showToast('已停止巡游');
  }
  const next = store.s.selected === id ? null : id;
  const hadFlow = store.s.showBloodFlow || store.s.showNerveFlow;
  store.set({ selected: next });
  // Store 在进入聚焦时会临时收起粒子流；这里明确告知，避免用户以为「开关坏了」
  if (next && focusActive(store.s) && hadFlow && !store.s.showBloodFlow && !store.s.showNerveFlow) {
    showToast(`已聚焦 ${organById.get(id)?.nameZh ?? '器官'} · 粒子流已暂时收起，退出聚焦后恢复`);
  }
}

export function clearSelection() {
  store.set({ selected: null });
}
