// 悬停 tooltip（跟随鼠标，玻璃小卡片）+ 统一 Esc 分发器 + 关于弹窗
const el = () => document.getElementById('tooltip') as HTMLElement;

export function showTooltip(label: string, en: string | undefined, x: number, y: number) {
  const t = el();
  t.hidden = false;
  t.innerHTML = `${label}${en ? `<span class="en">${en}</span>` : ''}`;
  // P2-4.4：用 getBoundingClientRect 实测宽高做四边 clamp（去掉 CSS 双重偏移）
  const rect = t.getBoundingClientRect();
  const pad = 8;
  let tx = x + 14, ty = y + 14;
  if (tx + rect.width + pad > innerWidth) tx = innerWidth - rect.width - pad;
  if (ty + rect.height + pad > innerHeight) ty = innerHeight - rect.height - pad;
  if (tx < pad) tx = pad;
  if (ty < pad) ty = pad;
  t.style.left = `${tx}px`;
  t.style.top = `${ty}px`;
}

export function hideTooltip() {
  el().hidden = true;
}

/** 统一 Esc 分发器：按层级逐层消费，一次 Esc 只关最上面一层 */
type EscHandler = () => boolean;
let escHandlers: { about: EscHandler; quiz: EscHandler; panel: EscHandler; tour: EscHandler } | null = null;

export function initEscDispatcher(h: { about: EscHandler; quiz: EscHandler; panel: EscHandler; tour: EscHandler }) {
  escHandlers = h;
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (escHandlers!.about()) return;
    if (escHandlers!.quiz()) return;
    if (escHandlers!.panel()) return;
    escHandlers!.tour();
  });
}

export function initAbout() {
  const modal = document.getElementById('about') as HTMLElement;
  const aboutBtn = document.getElementById('btn-about');
  document.getElementById('btn-about')?.addEventListener('click', () => {
    modal.hidden = false;
    (modal.querySelector('.modal-close') as HTMLElement | null)?.focus();
  });
  modal.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-close]')) {
      modal.hidden = true;
      aboutBtn?.focus();
    }
  });
}
