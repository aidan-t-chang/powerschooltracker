function normalizePercent(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 0 || percent > 150) return null;
  return Math.round(percent * 100) / 100;
}

export function applySnapshot(store, snapshot, now = new Date().toISOString()) {
  const classes = { ...(store?.classes || {}) };

  for (const item of snapshot?.classes || []) {
    if (!item || typeof item.id !== "string" || item.id === "") continue;
    if (typeof item.name !== "string" || item.name === "") continue;
    const percent = normalizePercent(item.percent);
    if (percent == null) continue;

    const term = typeof item.term === "string" ? item.term : "";
    const previous = classes[item.id];
    const point = { t: now, percent, term };

    if (!previous) {
      classes[item.id] = { id: item.id, name: item.name, lastSeen: now, points: [point] };
      continue;
    }

    const points = Array.isArray(previous.points) ? previous.points.slice() : [];
    const last = points[points.length - 1];
    if (!last || Number(last.percent) !== percent) points.push(point);
    classes[item.id] = { ...previous, name: item.name, lastSeen: now, points };
  }

  return {
    classes,
    hiddenClassIds: [...(store?.hiddenClassIds || [])],
  };
}
