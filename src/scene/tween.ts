// 极简补间管理器：一个数组 + 一个 tick，够用且零依赖
type Ease = (t: number) => number;
export const quinticInOut: Ease = (t) => (t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2);

interface Tween {
  t: number; dur: number; ease: Ease;
  onUpdate: (k: number) => void;
  onDone?: () => void;
  cancelled?: boolean;
}
export type { Tween };

const live = new Set<Tween>();

export function tween(dur: number, onUpdate: (k: number) => void, onDone?: () => void, ease: Ease = quinticInOut): Tween {
  const tw: Tween = { t: 0, dur: Math.max(0.0001, dur), ease, onUpdate, onDone };
  live.add(tw);
  return tw;
}

export function cancelTween(tw: Tween | undefined | null) { if (tw) tw.cancelled = true; }

export function updateTweens(dt: number) {
  for (const tw of [...live]) {
    if (tw.cancelled) { live.delete(tw); continue; }
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur);
    tw.onUpdate(tw.ease(k));
    if (k >= 1) { live.delete(tw); tw.onDone?.(); }
  }
}
