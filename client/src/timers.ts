import { useCallback, useEffect, useRef, useState } from 'react';

// Kitchen timers for cook mode. Several can run at once. They store the time
// they end (not a countdown), so they stay right when the phone sleeps or the
// page reloads, and they're kept for this tab in sessionStorage.

export type Timer = {
  id: string;
  label: string;
  step: number; // step index it came from, for "Step 3" labels
  seconds: number; // as set
  endsAt: number | null; // running: when it ends (ms)
  remainingMs: number; // paused: what's left
  doneAt: number | null; // finished: when (ms); ringing until dismissed
};

const RING_FOR_MS = 60_000;

function loadTimers(key: string): Timer[] {
  try {
    const raw = sessionStorage.getItem(key);
    const list = raw ? (JSON.parse(raw) as Timer[]) : [];
    return Array.isArray(list) ? list.filter((t) => t && typeof t.id === 'string') : [];
  } catch {
    return [];
  }
}

// One shared AudioContext, created on a tap (browsers only allow sound after one).
let audio: AudioContext | null = null;
function unlockAudio() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}

function beep() {
  if (!audio) return;
  const t0 = audio.currentTime;
  for (let i = 0; i < 3; i++) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    const start = t0 + i * 0.22;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + 0.18);
  }
}

export function remainingMs(t: Timer, now: number): number {
  if (t.doneAt != null) return 0;
  if (t.endsAt != null) return Math.max(0, t.endsAt - now);
  return t.remainingMs;
}

export function useTimers(storageKey: string) {
  const [timers, setTimers] = useState<Timer[]>(() => loadTimers(storageKey));
  const [now, setNow] = useState(() => Date.now());
  const titleRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(timers));
    } catch {
      // storage blocked: timers just won't survive a reload
    }
  }, [storageKey, timers]);

  const active = timers.some((t) => t.endsAt != null || t.doneAt != null);

  // Tick while anything is running or ringing; mark timers done as they finish.
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      const n = Date.now();
      setNow(n);
      setTimers((list) => {
        let changed = false;
        const next = list.map((t) => {
          if (t.endsAt != null && t.endsAt <= n) {
            changed = true;
            return { ...t, endsAt: null, remainingMs: 0, doneAt: n };
          }
          return t;
        });
        return changed ? next : list;
      });
    }, 250);
    return () => window.clearInterval(id);
  }, [active]);

  const ringing = timers.filter((t) => t.doneAt != null && now - t.doneAt < RING_FOR_MS);

  // Sound, buzz and a tab title while a timer is ringing.
  useEffect(() => {
    if (!ringing.length) {
      if (titleRef.current != null) {
        document.title = titleRef.current;
        titleRef.current = null;
      }
      return;
    }
    titleRef.current ??= document.title;
    document.title = `⏰ ${ringing[0].label} is done`;
    const ring = () => {
      beep();
      try {
        navigator.vibrate?.([300, 150, 300]);
      } catch {
        // no vibration here
      }
    };
    ring();
    const id = window.setInterval(ring, 1500);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ringing.length]);

  const update = (id: string, fn: (t: Timer) => Timer) => setTimers((list) => list.map((t) => (t.id === id ? fn(t) : t)));

  const start = useCallback((label: string, seconds: number, step: number) => {
    unlockAudio();
    const n = Date.now();
    setNow(n);
    setTimers((list) => [
      ...list,
      { id: `${n}-${Math.random().toString(36).slice(2, 7)}`, label, step, seconds, endsAt: n + seconds * 1000, remainingMs: seconds * 1000, doneAt: null },
    ]);
  }, []);

  return {
    timers,
    now,
    ringing,
    start,
    pause: (id: string) => update(id, (t) => (t.endsAt != null ? { ...t, remainingMs: Math.max(0, t.endsAt - Date.now()), endsAt: null } : t)),
    resume: (id: string) => {
      unlockAudio();
      update(id, (t) => (t.endsAt == null && t.doneAt == null ? { ...t, endsAt: Date.now() + t.remainingMs } : t));
    },
    addMinute: (id: string) =>
      update(id, (t) =>
        t.doneAt != null
          ? { ...t, doneAt: null, endsAt: Date.now() + 60_000, remainingMs: 60_000 }
          : t.endsAt != null
            ? { ...t, endsAt: t.endsAt + 60_000 }
            : { ...t, remainingMs: t.remainingMs + 60_000 },
      ),
    dismiss: (id: string) => setTimers((list) => list.filter((t) => t.id !== id)),
  };
}

/** m:ss, or h:mm:ss past an hour. */
export function clock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
