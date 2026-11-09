// 测验模式「找一找」：3D 点选作答，10 题一局，正向激励
// P1-4/5/6 修复：定时器句柄管理、localStorage try/catch、start 清 tour
import { ORGANS, store, enterMode, clearModeTimers, onModeExit } from '../state';

const BEST_KEY = 'lifevoyage-quiz-best';
const ROUNDS = 10;

interface QuizState {
  active: boolean; queue: string[]; idx: number; score: number;
  firstTry: boolean;
}
const q: QuizState = { active: false, queue: [], idx: 0, score: 0, firstTry: true };

let el: HTMLElement | null = null;
const banner = () => (el ??= document.getElementById('quiz-banner'));
let nextTimer: number | undefined;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function card(html: string) { banner()!.innerHTML = html; banner()!.hidden = false; }

function nextQuestion() {
  if (!q.active) return; // P1-5：stop 后不再推进
  q.idx++;
  if (q.idx >= ROUNDS) return finish();
  const id = q.queue[q.idx];
  q.firstTry = true;
  const def = ORGANS.find((o) => o.id === id)!;
  card(`
    <div class="quiz-top"><span class="quiz-progress">${q.idx + 1} / ${ROUNDS}</span>
    <span class="quiz-score">得分 ${q.score}</span>
    <button id="quiz-exit" class="icon-btn" title="结束测验">×</button></div>
    <div class="quiz-q">请找出：<b>${def.nameZh}</b></div>
    <div class="quiz-fb" id="quiz-fb">在人体上点击你认为的它</div>
  `);
  banner()!.querySelector('#quiz-exit')!.addEventListener('click', stop);
}

function finish() {
  if (!q.active) return; // 防重复 finish
  q.active = false;
  clearModeTimers();
  document.body.classList.remove('quiz-lock');
  store.set({ quizActive: false });
  // P1-6：localStorage try/catch（无痕模式/配额满时降级）
  let best = q.score;
  try {
    best = Math.max(q.score, Number(localStorage.getItem(BEST_KEY) ?? 0));
    localStorage.setItem(BEST_KEY, String(best));
  } catch { /* 无痕模式等场景下静默降级 */ }
  const praise = q.score >= 9 ? '解剖学家潜质！' : q.score >= 6 ? '已经很熟悉自己的身体了。' : '多逛两圈，下次一定更好。';
  card(`
    <div class="quiz-top"><span class="quiz-progress">本局结束</span>
    <button id="quiz-exit" class="icon-btn" title="关闭">×</button></div>
    <div class="quiz-q">得分 <b>${q.score}</b> / ${ROUNDS} <span class="quiz-best">最佳 ${best}</span></div>
    <div class="quiz-fb">${praise}</div>
    <div class="quiz-actions"><button id="quiz-again" class="text-btn">再来一局</button>
    <button id="quiz-close" class="text-btn">继续探索</button></div>
  `);
  banner()!.querySelector('#quiz-exit')!.addEventListener('click', stop);
  banner()!.querySelector('#quiz-again')!.addEventListener('click', start);
  banner()!.querySelector('#quiz-close')!.addEventListener('click', stop);
}

export function isActive() { return q.active; }

export function start() {
  if (q.active) return;
  // P1-4：通过 modeController 统一互斥（自动停巡游、退血流）
  enterMode('quiz');
  document.body.classList.add('quiz-lock');
  q.active = true;
  q.queue = shuffle(ORGANS.filter((o) => o.id !== 'skin').map((o) => o.id)).slice(0, ROUNDS);
  q.idx = -1; q.score = 0; q.firstTry = true;
  nextQuestion();
}

export function stop() {
  clearNextTimer();
  clearModeTimers();
  q.active = false;
  document.body.classList.remove('quiz-lock');
  store.set({ quizActive: false });
  banner()!.hidden = true;
}

/** 3D 点选作答；返回 true 表示该点击已被测验消费 */
export function answer(organId: string): boolean {
  if (!q.active) return false;
  const target = q.queue[q.idx];
  const def = ORGANS.find((o) => o.id === target)!;
  if (organId === target) {
    if (q.firstTry) q.score++;
    const fb = banner()!.querySelector('#quiz-fb')!;
    fb.innerHTML = `✓ 答对了！这就是<b>${def.nameZh}</b>`;
    // P1-5：保存 timer 句柄，stop 时清理
    nextTimer = window.setTimeout(nextQuestion, 900);
    return true;
  }
  const picked = ORGANS.find((o) => o.id === organId);
  q.firstTry = false;
  const fb = banner()!.querySelector('#quiz-fb')!;
  const hintDir = (() => {
    const t = ORGANS.find((o) => o.id === target)!;
    const p = ORGANS.find((o) => o.id === organId)!;
    const dy = (t.camera.target[1] ?? 1) - (p.camera.target[1] ?? 1);
    if (dy > 0.08) return '目标比它更靠上';
    if (dy < -0.08) return '目标比它更靠下';
    return '方向对了，再试试别的区域';
  })();
  fb.innerHTML = `✗ 这是<b>${picked?.nameZh ?? '其它部位'}</b>——提示：${hintDir}。要找的是<b>${def.nameZh}</b>`;
  return true;
}

/** stop 时清理 nextQuestion 定时器 */
export function clearNextTimer() { if (nextTimer !== undefined) { window.clearTimeout(nextTimer); nextTimer = undefined; } }

// 任何模式切换（透视 / 巡游 / 回到浏览）都先让测验真正收尾，
// 避免 store.quizActive 已为 false 而 q.active / 横幅 / quiz-lock 仍残留。
onModeExit(() => { if (q.active) stop(); });
