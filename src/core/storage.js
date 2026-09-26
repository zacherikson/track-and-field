// Tiny localStorage wrapper. Storage can throw (private mode, quota, disabled),
// so every access is guarded and the game still works without persistence.
const KEY = 'thumbathlon.v1';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function getBest(eventId) {
  return load().best?.[eventId] ?? null;
}

/** Records a result; returns true if it is a new personal best. `lowerIsBetter` for timed events. */
export function submitBest(eventId, value, lowerIsBetter = true) {
  const data = load();
  data.best ??= {};
  const prev = data.best[eventId];
  const better = prev == null || (lowerIsBetter ? value < prev : value > prev);
  if (better) {
    data.best[eventId] = value;
    save(data);
  }
  return better;
}
