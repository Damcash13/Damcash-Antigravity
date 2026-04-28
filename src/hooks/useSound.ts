import { useRef, useCallback } from 'react';

// ── Module-level shared state ─────────────────────────────────────────────────
// All hook instances share the same enabled flag so toggling from Header
// immediately affects every in-flight play() call across the app.
function readPref(): boolean {
  try { return localStorage.getItem('damcash_sound') !== 'off'; } catch { return true; }
}
function writePref(v: boolean): void {
  try { localStorage.setItem('damcash_sound', v ? 'on' : 'off'); } catch {}
}

let _soundEnabled: boolean = readPref();

export function getSoundEnabled(): boolean { return _soundEnabled; }
export function setSoundEnabled(v: boolean): void { _soundEnabled = v; writePref(v); }
export function toggleSoundGlobal(): boolean {
  _soundEnabled = !_soundEnabled;
  writePref(_soundEnabled);
  return _soundEnabled;
}

// ── Audio helpers ─────────────────────────────────────────────────────────────

function createAudioContext(): AudioContext | null {
  try {
    return new (window.AudioContext || (window as any).webkitAudioContext)();
  } catch {
    return null;
  }
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume = 0.3,
  delay = 0
): void {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime + delay);
  gainNode.gain.setValueAtTime(0, ctx.currentTime + delay);
  gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + delay + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
  oscillator.start(ctx.currentTime + delay);
  oscillator.stop(ctx.currentTime + delay + duration);
}

type SoundType = 'move' | 'capture' | 'check' | 'gameEnd' | 'promote' | 'clock' | 'notification' | 'betPlaced' | 'betWon';

export function useSound() {
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) ctxRef.current = createAudioContext();
    return ctxRef.current;
  }, []);

  const play = useCallback((sound: SoundType) => {
    if (!_soundEnabled) return;          // check module-level flag
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    switch (sound) {
      case 'move':
        playTone(ctx, 440, 0.1, 'sine', 0.2);
        break;
      case 'capture':
        playTone(ctx, 300, 0.05, 'square', 0.25);
        playTone(ctx, 220, 0.1, 'square', 0.2, 0.05);
        break;
      case 'check':
        playTone(ctx, 600, 0.1, 'square', 0.3);
        playTone(ctx, 800, 0.15, 'square', 0.25, 0.1);
        break;
      case 'gameEnd':
        playTone(ctx, 523, 0.3, 'sine', 0.3);
        playTone(ctx, 659, 0.3, 'sine', 0.3, 0.3);
        playTone(ctx, 784, 0.5, 'sine', 0.4, 0.6);
        break;
      case 'promote':
        playTone(ctx, 523, 0.15, 'sine', 0.3);
        playTone(ctx, 659, 0.15, 'sine', 0.3, 0.15);
        playTone(ctx, 784, 0.2, 'sine', 0.35, 0.3);
        playTone(ctx, 1047, 0.3, 'sine', 0.4, 0.5);
        break;
      case 'clock':
        playTone(ctx, 880, 0.05, 'sine', 0.15);
        break;
      case 'notification':
        playTone(ctx, 700, 0.1, 'sine', 0.2);
        playTone(ctx, 900, 0.15, 'sine', 0.2, 0.1);
        break;
      case 'betPlaced':
        playTone(ctx, 440, 0.1, 'sine', 0.2);
        playTone(ctx, 550, 0.1, 'sine', 0.2, 0.1);
        playTone(ctx, 660, 0.2, 'sine', 0.3, 0.2);
        break;
      case 'betWon':
        [0, 0.15, 0.3, 0.45, 0.6].forEach((delay, i) => {
          playTone(ctx, 400 + i * 100, 0.2, 'sine', 0.3, delay);
        });
        break;
    }
  }, [getCtx]);

  // toggle() and setEnabled() now update the shared module-level flag
  const toggle = useCallback(() => toggleSoundGlobal(), []);
  const setEnabled = useCallback((enabled: boolean) => setSoundEnabled(enabled), []);

  return { play, toggle, setEnabled };
}
