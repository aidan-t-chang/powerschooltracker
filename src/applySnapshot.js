function normalizePercent(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 0 || percent > 150) return null;
  return Math.round(percent * 100) / 100;
}

function localDate(value) {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
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

    // if no last or diff date or diff percent
    if (!last || localDate(last.t) !== localDate(now) || Number(last.percent) !== percent) {
      points.push(point);
    }

    classes[item.id] = { ...previous, name: item.name, lastSeen: now, points };
  }

  return {
    classes,
    hiddenClassIds: [...(store?.hiddenClassIds || [])],
  };
}
