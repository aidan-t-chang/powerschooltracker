const STORAGE_KEY = "grade-tracker-preview";

let state = { classes: {}, hiddenClassIds: [] };
let plotted = [];

function chromeStorageAvailable() {
  return typeof chrome !== "undefined" && typeof chrome.storage?.local?.get === "function";
}

function seed() {
  return {
    classes: {
      "ccid:1": {
        id: "ccid:1",
        name: "English 9",
        points: [
          { t: "2026-09-15T15:00:00.000Z", percent: 91, term: "Q1" },
          { t: "2026-10-02T15:00:00.000Z", percent: 88, term: "Q2" },
          { t: "2026-10-20T15:00:00.000Z", percent: 93, term: "Q2" },
        ],
      },
      "ccid:2": {
        id: "ccid:2",
        name: "Biology",
        points: [{ t: "2026-10-20T15:00:00.000Z", percent: 85, term: "Q2" }],
      },
    },
    hiddenClassIds: [],
  };
}

function previewing() {
  return new URLSearchParams(location.search).has("preview");
}

async function loadState() {
  if (chromeStorageAvailable()) {
    return chrome.storage.local.get({ classes: {}, hiddenClassIds: [] });
  }
  if (!previewing()) return { classes: {}, hiddenClassIds: [] };
  const saved = sessionStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }
  const seeded = seed();
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

async function saveHidden(next) {
  if (chromeStorageAvailable()) {
    await chrome.storage.local.set({ hiddenClassIds: next.hiddenClassIds });
    return;
  }
  if (previewing()) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function colorForId(id) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 33 + id.charCodeAt(index)) >>> 0;
  }
  return `hsl(${hash % 360} 58% 38%)`;
}

function classEntries(current) {
  return Object.values(current.classes || {})
    .filter((entry) => entry && entry.id && entry.name && Array.isArray(entry.points))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function renderList(classes, hidden) {
  const list = document.querySelector("#classes");
  list.replaceChildren();
  for (const entry of classes) {
    const item = document.createElement("li");
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !hidden.has(entry.id);
    input.addEventListener("change", () => {
      onToggle(entry.id, input.checked);
    });
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = colorForId(entry.id);
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = entry.name;
    label.append(input, swatch, name);
    item.append(label);
    list.append(item);
  }
}

function render(current) {
  const classes = classEntries(current);
  const hidden = new Set(current.hiddenClassIds || []);
  const visible = classes.filter((entry) => !hidden.has(entry.id) && entry.points.length);
  renderList(classes, hidden);

  const message = document.querySelector("#message");
  const wrap = document.querySelector("#chart-wrap");
  const note = document.querySelector("#note");
  document.querySelector("#tooltip").hidden = true;

  if (!classes.length) {
    wrap.hidden = true;
    note.hidden = true;
    message.hidden = false;
    message.textContent = "Open PowerSchool while signed in to your student account.";
    plotted = [];
    return;
  }

  if (!visible.length) {
    wrap.hidden = true;
    note.hidden = true;
    message.hidden = false;
    message.textContent = "Select a class to show its grades.";
    plotted = [];
    return;
  }

  message.hidden = true;
  wrap.hidden = false;
  drawChart(document.querySelector("#chart"), seriesFrom(visible));
  const hasLine = visible.some((entry) => entry.points.length >= 2);
  note.hidden = hasLine;
  note.textContent = "A line appears after this grade changes.";
}

function seriesFrom(classes) {
  return classes.map((entry) => ({
    id: entry.id,
    name: entry.name,
    color: colorForId(entry.id),
    points: entry.points
      .filter((point) => !Number.isNaN(Date.parse(point.t)) && Number.isFinite(Number(point.percent)))
      .map((point) => ({ ...point, percent: Number(point.percent) }))
      .sort((a, b) => Date.parse(a.t) - Date.parse(b.t)),
  }));
}

function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

function axisRange(values) {
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min = Math.max(0, min - 5);
    max = Math.min(150, max + 5);
  } else {
    const pad = Math.max(2, (max - min) * 0.15);
    min = Math.max(0, min - pad);
    max = Math.min(150, max + pad);
  }
  if (max - min < 10) {
    const mid = (min + max) / 2;
    min = Math.max(0, mid - 5);
    max = Math.min(150, mid + 5);
  }
  if (max <= min) {
    min = 0;
    max = 10;
  }
  return { min, max };
}

function yTicks(min, max) {
  const span = max - min;
  const step = span <= 12 ? 2 : span <= 25 ? 5 : span <= 50 ? 10 : 25;
  const start = Math.ceil((min + 0.001) / step) * step;
  const ticks = [];
  for (let value = start; value <= max + 0.001; value += step) {
    ticks.push(Math.round(value * 100) / 100);
  }
  return ticks;
}

function formatAxisDate(time, tMin, tMax) {
  const options = { month: "short", day: "numeric" };
  if (new Date(tMin).getFullYear() !== new Date(tMax).getFullYear()) options.year = "numeric";
  return new Date(time).toLocaleDateString(undefined, options);
}

function dateLabels(tMin, tMax) {
  const mid = tMin + (tMax - tMin) / 2;
  const labels = [
    { t: tMin, text: formatAxisDate(tMin, tMin, tMax), align: "left" },
    { t: mid, text: formatAxisDate(mid, tMin, tMax), align: "center" },
    { t: tMax, text: formatAxisDate(tMax, tMin, tMax), align: "right" },
  ];
  if (labels[0].text === labels[2].text) return [labels[1]];
  if (labels[0].text === labels[1].text || labels[1].text === labels[2].text) return [labels[0], labels[2]];
  return labels;
}

function chartLayout(series, width, height) {
  const points = series.flatMap((entry) => entry.points);
  if (!points.length) return null;

  const times = points.map((point) => Date.parse(point.t));
  let tMin = Math.min(...times);
  let tMax = Math.max(...times);
  if (tMin === tMax) {
    tMin -= 24 * 60 * 60 * 1000;
    tMax += 24 * 60 * 60 * 1000;
  }
  const { min: yMin, max: yMax } = axisRange(points.map((point) => point.percent));
  const pad = { left: 42, right: 12, top: 14, bottom: 30 };
  const plotLeft = pad.left + 6;
  const plotRight = width - pad.right - 6;
  const plotTop = pad.top + 4;
  const plotBottom = height - pad.bottom - 4;

  return {
    pad,
    width,
    height,
    yMin,
    yMax,
    yTicks: yTicks(yMin, yMax),
    xLabels: dateLabels(tMin, tMax),
    xOf(time) {
      return plotLeft + ((time - tMin) / (tMax - tMin)) * (plotRight - plotLeft);
    },
    yOf(value) {
      return plotTop + (1 - (value - yMin) / (yMax - yMin)) * (plotBottom - plotTop);
    },
  };
}

function drawChart(canvas, series) {
  const { ctx, width, height } = setupCanvas(canvas);
  plotted = [];
  ctx.clearRect(0, 0, width, height);
  const layout = chartLayout(series, width, height);
  if (!layout) return;

  ctx.font = "11px system-ui, sans-serif";
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#e7e5e4";
  ctx.fillStyle = "#78716c";
  for (const tick of layout.yTicks) {
    const y = layout.yOf(tick);
    ctx.beginPath();
    ctx.moveTo(layout.pad.left, y);
    ctx.lineTo(width - layout.pad.right, y);
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(String(tick), layout.pad.left - 6, y);
  }
  ctx.textBaseline = "top";
  for (const label of layout.xLabels) {
    ctx.textAlign = label.align;
    const x =
      label.align === "left" ? layout.pad.left : label.align === "right" ? width - layout.pad.right : layout.xOf(label.t);
    ctx.fillText(label.text, x, height - layout.pad.bottom + 8);
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.pad.left, layout.pad.top, width - layout.pad.left - layout.pad.right, height - layout.pad.top - layout.pad.bottom);
  ctx.clip();
  for (const entry of series) {
    const coords = entry.points.map((point) => ({
      x: layout.xOf(Date.parse(point.t)),
      y: layout.yOf(point.percent),
      name: entry.name,
      color: entry.color,
      percent: point.percent,
      term: point.term,
      t: point.t,
    }));
    if (coords.length > 1) {
      ctx.beginPath();
      coords.forEach((coord, index) => {
        if (index === 0) ctx.moveTo(coord.x, coord.y);
        else ctx.lineTo(coord.x, coord.y);
      });
      ctx.strokeStyle = entry.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
    }
    for (const coord of coords) {
      ctx.beginPath();
      ctx.fillStyle = entry.color;
      ctx.arc(coord.x, coord.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      plotted.push(coord);
    }
  }
  ctx.restore();
}

function formatPercent(value) {
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}

function formatFullDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function nearest(x, y) {
  let best = null;
  let bestDist = 14;
  for (const point of plotted) {
    const dist = Math.hypot(point.x - x, point.y - y);
    if (dist < bestDist) {
      best = point;
      bestDist = dist;
    }
  }
  return best;
}

function onMove(event) {
  const canvas = event.currentTarget;
  const rect = canvas.getBoundingClientRect();
  const hit = nearest(event.clientX - rect.left, event.clientY - rect.top);
  const tip = document.querySelector("#tooltip");
  if (!hit) {
    tip.hidden = true;
    return;
  }
  tip.hidden = false;
  tip.replaceChildren();
  const name = document.createElement("strong");
  name.textContent = hit.name;
  const detail = document.createElement("div");
  const term = hit.term ? `${hit.term} · ` : "";
  detail.textContent = `${term}${formatPercent(hit.percent)} · ${formatFullDate(hit.t)}`;
  tip.append(name, detail);

  const wrap = document.querySelector("#chart-wrap").getBoundingClientRect();
  let left = event.clientX - wrap.left + 10;
  let top = event.clientY - wrap.top + 10;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  const tipRect = tip.getBoundingClientRect();
  if (left + tipRect.width + 8 > wrap.width) left = Math.max(0, event.clientX - wrap.left - tipRect.width - 10);
  if (top + tipRect.height + 8 > wrap.height) top = Math.max(0, event.clientY - wrap.top - tipRect.height - 10);
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

async function onToggle(id, checked) {
  const hidden = new Set(state.hiddenClassIds || []);
  if (checked) hidden.delete(id);
  else hidden.add(id);
  state = { ...state, hiddenClassIds: [...hidden] };
  await saveHidden(state);
  render(state);
}

async function init() {
  state = await loadState();
  render(state);
  if (chromeStorageAvailable()) {
    chrome.storage.onChanged.addListener((_changes, area) => {
      if (area !== "local") return;
      loadState().then((next) => {
        state = next;
        render(state);
      });
    });
  }
  const canvas = document.querySelector("#chart");
  canvas.addEventListener("mousemove", onMove);
  canvas.addEventListener("mouseleave", () => {
    document.querySelector("#tooltip").hidden = true;
  });
}

init();
