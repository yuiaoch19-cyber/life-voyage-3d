// 心音合成（WebAudio，零素材）：lub-dub 与心跳包络严格同步
// 默认关闭；首次开启由用户手势触发（满足自动播放策略）
export class HeartSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = false;
  private prevPh = 0;

  setEnabled(on: boolean) {
    this.enabled = on;
    if (on) {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 240;
        this.master.connect(lp); lp.connect(this.ctx.destination);
      }
      this.ctx.resume();
    } else {
      this.ctx?.suspend();
    }
  }

  /** 每帧调用：检测心跳相位回绕（新周期），排程 lub（S1）与 dub（S2） */
  tick(pulse: number, bpm: number, elapsed: number) {
    void pulse;
    if (!this.enabled || !this.ctx || !this.master) { this.prevPh = 0; return; }
    const period = 60 / bpm;
    const ph = ((elapsed * bpm) / 60) % 1;
    if (this.prevPh > ph) {
      // 新心动周期：S1 在 ph≈0，S2 在 ph≈0.34
      const t0 = this.ctx.currentTime + 0.02;
      this.thump(t0, 52, 0.16, 0.85);                 // S1 lub（二尖瓣/三尖瓣关闭）
      this.thump(t0 + period * 0.34, 68, 0.11, 0.5);  // S2 dub（主动脉瓣关闭）
    }
    this.prevPh = ph;
  }

  private thump(t: number, freq: number, dur: number, gain: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.master!);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
}
