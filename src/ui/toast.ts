// 轻量提示条：模式切换、被接管操作的说明都走这里，避免"点了没反应"
let el: HTMLElement | null = null;
let hideTimer: number | undefined;
let clearTimer: number | undefined;

export function showToast(message: string, duration = 2600) {
  el ??= document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  el.classList.add('show');
  if (hideTimer !== undefined) window.clearTimeout(hideTimer);
  if (clearTimer !== undefined) window.clearTimeout(clearTimer);
  hideTimer = window.setTimeout(() => {
    el?.classList.remove('show');
    clearTimer = window.setTimeout(() => { if (el) el.hidden = true; }, 220);
  }, duration);
}
