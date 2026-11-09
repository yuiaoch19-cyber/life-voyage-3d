// 右侧信息面板：器官详情 + 健康对比（病变模拟）
// P2-12：仅 selected 变化时重建 innerHTML（防止拖 HUD 滑杆导致面板重建丢状态）
import { organById, systemById, store } from '../state';

export interface PanelHooks {
  onDisease: (id: string, v: number) => void;
  onCompare: (id: string) => void;
}
let hooks: PanelHooks | null = null;

export function initPanel(onClose: () => void, panelHooks: PanelHooks) {
  hooks = panelHooks;
  const panel = document.getElementById('panel') as HTMLElement;
  const body = document.getElementById('panel-body') as HTMLElement;
  const closeBtn = document.getElementById('panel-close') as HTMLButtonElement;
  closeBtn.addEventListener('click', onClose);
  // P2-5：Esc 由统一分发器处理（tooltip.ts initEscDispatcher）

  let lastRendered: string | null = null;
  store.on((s) => {
    if (!s.selected) { panel.classList.remove('open'); lastRendered = null; return; }
    if (s.selected === lastRendered) return; // 同一器官，不重建（保留滑杆/滚动位置）
    lastRendered = s.selected;
    const o = organById.get(s.selected);
    if (!o) { panel.classList.remove('open'); return; }
    const sys = systemById.get(o.system)!;
    const d = o.disease;
    body.innerHTML = `
      <span class="chip" style="--c:${sys.color}">${sys.label}系统</span>
      <h2>${o.nameZh}<span class="en">${o.nameEn}</span></h2>
      <p class="summary">${o.summary}</p>
      <h3>结构要点</h3>
      <ul>${o.structure.map((x) => `<li>${x}</li>`).join('')}</ul>
      <h3>趣味数据</h3>
      <ul class="facts">${o.facts.map((f) => `<li class="fact">${f.text}<span class="ref">来源：${f.reference}</span></li>`).join('')}</ul>
      ${d ? `
      <h3>健康对比 · 病变模拟 <span class="sim-note">教育性模拟 · 非真实病理标本</span></h3>
      <p class="disease-name">${d.name}</p>
      <div class="disease-slider">
        <span>健康</span>
        <input id="disease-range" type="range" min="0" max="100" value="0" />
        <span>病变</span>
      </div>
      <ul class="disease-changes" id="disease-changes" hidden>${d.changes.map((x) => `<li>${x}</li>`).join('')}</ul>
      <p class="reversible">✦ 回头路：${d.reversible}</p>
      <p class="ref">来源：${d.reference}</p>
      <button id="btn-compare" class="text-btn compare-btn">并排对比</button>
      ` : ''}
      <h3>如何善待它</h3>
      <ul class="care">${o.careTips.map((x) => `<li>${x}</li>`).join('')}</ul>
      <p class="panel-foot">以上内容仅供健康教育科普，不构成医疗建议。数据来源已逐条标注。</p>
    `;
    if (d) {
      const range = body.querySelector('#disease-range') as HTMLInputElement;
      const changes = body.querySelector('#disease-changes') as HTMLElement;
      range.addEventListener('input', () => {
        changes.hidden = range.valueAsNumber <= 0;
        hooks?.onDisease(o.id, range.valueAsNumber / 100);
      });
      body.querySelector('#btn-compare')?.addEventListener('click', () => hooks?.onCompare(o.id));
    }
    panel.classList.add('open');
    panel.scrollTop = 0;
  });
}

export function closePanel() {
  const panel = document.getElementById('panel') as HTMLElement;
  panel.classList.remove('open');
}

/** 并排对比时锁定病变滑杆：拖动会改主器官（健康侧），使对比语义失效 */
export function setDiseaseSliderDisabled(v: boolean) {
  const range = document.getElementById('disease-range') as HTMLInputElement | null;
  if (range) range.disabled = v;
}

/** 对比模式把健康侧滑杆归零时同步 UI */
export function setDiseaseSlider(v: number) {
  const range = document.getElementById('disease-range') as HTMLInputElement | null;
  if (!range) return;
  range.value = String(Math.round(v * 100));
  const changes = document.getElementById('disease-changes') as HTMLElement | null;
  if (changes) changes.hidden = v <= 0;
}
