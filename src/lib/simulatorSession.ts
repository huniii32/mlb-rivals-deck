/** Versioned device-local simulator snapshots. Never shared with deck rankings. */
export function readSession<T>(key: string, valid: (value: unknown) => value is T): T | null {
  try {
    const raw = localStorage.getItem(`rivals.simulator.${key}.v1`);
    if (!raw || raw.length > 1000000) return null;
    const value: unknown = JSON.parse(raw);
    return valid(value) ? value : null;
  } catch { return null; }
}
export function saveSession(key: string, value: unknown): boolean {
  try { localStorage.setItem(`rivals.simulator.${key}.v1`, JSON.stringify(value)); return true; }
  catch { return false; }
}
export const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const counter = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x=>typeof x==='string');
