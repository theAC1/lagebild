// Kurzes Signal bei neuem Auftrag: Vibration und ein Piepton (Ton erst nach der ersten Berührung erlaubt).
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

export function signal(): void {
  navigator.vibrate?.([200, 100, 200]);
  if (!ctx || ctx.state !== 'running') return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 660;
  gain.gain.value = 0.15;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.25);
}
