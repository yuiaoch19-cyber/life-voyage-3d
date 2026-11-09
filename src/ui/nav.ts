// 左栏器官导航 + 顶部系统切换 + 搜索
import { ORGANS, SYSTEMS, organById, systemById, store, type SystemId } from '../state';
import { selectOrgan } from '../systems/selection';
import { showToast } from './toast';

export function initNav() {
  const switchEl = document.getElementById('system-switch') as HTMLElement;
  const navEl = document.getElementById('nav') as HTMLElement;
  const searchEl = document.getElementById('search') as HTMLInputElement;

  /* ---- 窄屏：左栏改为可唤出的抽屉，保留器官导航入口 ---- */
  const navBtn = document.getElementById('btn-nav');
  const setNavOpen = (open: boolean) => {
    navEl.classList.toggle('open', open);
    navBtn?.setAttribute('aria-expanded', String(open));
    navBtn?.setAttribute('aria-label', open ? '关闭器官导航' : '打开器官导航');
  };
  navBtn?.addEventListener('click', () => setNavOpen(!navEl.classList.contains('open')));
  document.addEventListener('pointerdown', (e) => {
    if (!navEl.classList.contains('open')) return;
    const t = e.target as HTMLElement;
    if (!navEl.contains(t) && !navBtn?.contains(t)) setNavOpen(false);
  });

  /* ---- 顶部系统切换 ---- */
  const sysBtns = new Map<SystemId, HTMLButtonElement>();
  for (const sys of SYSTEMS.filter((s) => s.id === 'all' || s.id === 'skeletal' || s.id === 'muscular' || ORGANS.some((o) => o.system === s.id))) {
    const b = document.createElement('button');
    b.textContent = sys.label;
    b.dataset.system = sys.id;
    b.addEventListener('click', () => {
      if (store.s.quizActive) { showToast('测验中系统切换暂不可用，结束测验后恢复'); return; }
      store.set({ system: sys.id });
      // 推荐值 5：Store 会把系统重定向到已选中器官所属系统，这里明确告知用户原因
      if (store.s.system !== sys.id) {
        const def = store.s.selected ? organById.get(store.s.selected) : null;
        showToast(`已保持在「${systemById.get(store.s.system)?.label ?? ''}系统」以显示已选中的 ${def?.nameZh ?? '器官'}`);
      }
    });
    switchEl.appendChild(b);
    sysBtns.set(sys.id, b);
  }

  /* ---- 左栏分组列表 ---- */
  const items = new Map<string, HTMLButtonElement>();
  const groups = new Map<SystemId, HTMLElement>();
  for (const sys of SYSTEMS) {
    if (sys.id === 'all') continue;
    const list = ORGANS.filter((o) => o.system === sys.id);
    if (!list.length) continue;
    const g = document.createElement('div');
    g.dataset.system = sys.id;
    g.innerHTML = `<div class="nav-group-title" style="--dot:${sys.color}">${sys.label}系统</div>`;
    for (const o of list) {
      const item = document.createElement('button');
      item.className = 'nav-item';
      item.dataset.organ = o.id;
      item.innerHTML = `<span class="zh">${o.nameZh}</span><span class="en">${o.nameEn}</span>`;
      item.addEventListener('click', () => { selectOrgan(o.id, 'nav'); setNavOpen(false); });
      item.addEventListener('pointerenter', () => store.set({ hovered: o.id }));
      item.addEventListener('pointerleave', () => store.set({ hovered: null }));
      g.appendChild(item);
      items.set(o.id, item);
    }
    navEl.appendChild(g);
    groups.set(sys.id, g);
  }

  /* ---- 状态联动 ---- */
  store.on((s) => {
    for (const [id, b] of sysBtns) b.classList.toggle('on', s.system === id);
    for (const [sysId, g] of groups) {
      (g as HTMLElement).style.display = s.system === 'all' || s.system === sysId ? '' : 'none';
    }
    for (const [id, item] of items) {
      item.classList.toggle('on', s.selected === id);
      const o = organById.get(id);
      const inSystem = s.system === 'all' || o?.system === s.system;
      item.classList.toggle('dimmed', !!s.selected && s.selected !== id);
      if (!inSystem && s.system !== 'all') item.classList.add('dimmed');
    }
  });

  /* ---- 搜索 ---- */
  const applyFilter = () => {
    const q = searchEl.value.trim().toLowerCase();
    for (const [id, item] of items) {
      const o = organById.get(id)!;
      const hit = !q || o.nameZh.includes(q) || o.nameEn.toLowerCase().includes(q);
      (item as HTMLElement).style.display = hit ? '' : 'none';
    }
    // 空结果时隐藏整组标题
    for (const [, g] of groups) {
      const any = [...g.querySelectorAll<HTMLElement>('.nav-item')].some((el) => el.style.display !== 'none');
      (g.querySelector('.nav-group-title') as HTMLElement).style.display = any ? '' : 'none';
    }
  };
  searchEl.addEventListener('input', applyFilter);
  searchEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const first = [...items.entries()].find(([, el]) => el.style.display !== 'none');
    if (first) selectOrgan(first[0], 'search');
    searchEl.blur();
  });
}
