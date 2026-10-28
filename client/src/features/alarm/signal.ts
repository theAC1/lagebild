// Alarmsignal: Vibration + Piepton. Browser erlauben Ton erst nach einer Nutzerinteraktion,
// darum wird der AudioContext bei der ersten Berührung/Taste angelegt bzw. fortgesetzt.
let ctx: AudioContext | null = null;

function entsperren(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state !== 'running') void ctx.resume();
  } catch {
    /* kein WebAudio: nur Vibration */
  }
}
addEventListener('pointerdown', entsperren, { capture: true, passive: true });
addEventListener('keydown', entsperren, { capture: true, passive: true });

/** Drei kurze Pieptöne (880 Hz, Rechteck). Still, solange kein Ton erlaubt ist. */
function piepe(): void {
  if (!ctx || ctx.state !== 'running') return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = 880;
  gain.gain.value = 0;
  const t0 = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    const t = t0 + i * 0.3;
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.setValueAtTime(0, t + 0.18);
  }
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + 0.9);
}

export function alarmSignal(): void {
  navigator.vibrate?.([500, 200, 500, 200, 900]);
  piepe();
}
