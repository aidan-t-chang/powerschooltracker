const META_HEADERS = new Set([
  "exp",
  "per",
  "period",
  "expression",
  "course",
  "teacher",
  "instructor",
  "rm",
  "room",
  "abs",
  "absence",
  "absences",
  "absent",
  "tdy",
  "tdies",
  "tar",
  "tardy",
  "tardies",
  "att",
  "attendance",
]);

export function clean(text) {
  return String(text ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function headerKey(text) {
  return clean(text).toLowerCase().replace(/[.:]+$/g, "");
}

function isSubhead(text) {
  return /^(grades?|percents?|%|scores?|comments?)$/i.test(headerKey(text));
}

function isComment(text) {
  return /^comments?$/i.test(headerKey(text));
}

function cellText(cell) {
  if (!cell) return "";
  const inner = cell.innerText;
  if (typeof inner === "string" && inner.trim()) return inner;
  return cell.textContent || "";
}

export function parsePercent(text) {
  const cleaned = clean(text);
  if (!cleaned) return null;

  const fraction = cleaned.match(/(\d{1,3}(?:\.\d+)?)\s*\/\s*100\b/);
  if (fraction) {
    const earned = Number(fraction[1]);
    if (earned >= 0 && earned <= 150) return roundPercent(earned);
  }

  const matches = cleaned.match(/\d{1,3}(?:\.\d+)?/g);
  if (!matches) return null;
  const values = matches.map(Number).filter((value) => value >= 0 && value <= 150);
  if (!values.length) return null;
  return roundPercent(values[values.length - 1]);
}

function roundPercent(value) {
  return Math.round(value * 100) / 100;
}

function isHeaderRow(row) {
  const cells = [...(row?.cells || [])];
  return cells.length > 0 && cells.every((cell) => String(cell.tagName).toUpperCase() === "TH");
}

function headerGrid(headerRows) {
  const grid = [];
  headerRows.forEach((row, rowIndex) => {
    if (!grid[rowIndex]) grid[rowIndex] = [];
    let column = 0;
    for (const cell of row.cells) {
      while (grid[rowIndex][column]) column += 1;
      const text = clean(cellText(cell));
      const rowSpan = cell.rowSpan || 1;
      const colSpan = cell.colSpan || 1;
      for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
        if (!grid[rowIndex + rowOffset]) grid[rowIndex + rowOffset] = [];
        for (let columnOffset = 0; columnOffset < colSpan; columnOffset += 1) {
          grid[rowIndex + rowOffset][column + columnOffset] = text;
        }
      }
      column += colSpan;
    }
  });
  return grid;
}

function roleFor(texts) {
  const joined = texts.map(headerKey).join(" ");
  if (/\bcourse\b/.test(joined)) return "course";
  if (/\b(teacher|instructor)\b/.test(joined)) return "teacher";
  if (/\b(exp|period|expression|per)\b/.test(joined)) return "period";
  return null;
}

function columnInfo(grid, column) {
  const labels = [];
  for (let rowIndex = 0; rowIndex < grid.length; rowIndex += 1) {
    labels.push(grid[rowIndex]?.[column] || "");
  }
  const nonempty = labels.map(clean).filter(Boolean);
  const role = roleFor(nonempty);
  if (nonempty.some((text) => META_HEADERS.has(headerKey(text)))) return { kind: "meta", role };

  const lowest = clean(labels[labels.length - 1] || "");
  if (isComment(lowest) || (labels.length > 1 && lowest === "")) return { kind: "skip" };

  const term = nonempty.find((text) => !isSubhead(text));
  if (!term) return { kind: "skip" };
  return { kind: "grade", term };
}

function cellsByColumn(row) {
  const map = [];
  let column = 0;
  for (const cell of row.cells || []) {
    const span = cell.colSpan || 1;
    for (let offset = 0; offset < span; offset += 1) map[column + offset] = cell;
    column += span;
  }
  return map;
}

function linksIn(row) {
  const links = [];
  for (const cell of row.cells || []) {
    const found = cell.querySelectorAll?.("a") || [];
    for (const link of found) links.push(link);
  }
  return links;
}

function param(href, key) {
  try {
    return new URL(href, "https://student.powerschool.com").searchParams.get(key);
  } catch {
    return null;
  }
}

function norm(value) {
  return clean(value).toLowerCase();
}

// The scores link's frn is often one term's stored grade, so it changes when
// the quarter rolls. Prefer the row's section enrollment id when PowerSchool
// provides it, and only then an id from the scores link.
function classId(row, course, teacher) {
  const ccid = String(row.id || "").match(/ccid_(\d+)/i);
  if (ccid) return `ccid:${ccid[1]}`;

  const links = linksIn(row);
  for (const link of links) {
    const href = link.getAttribute?.("href") || "";
    if (!/scores\.html/i.test(href)) continue;
    const section = param(href, "sectionid") || param(href, "sectid");
    if (section) return `section:${section}`;
  }

  for (const link of links) {
    const href = link.getAttribute?.("href") || "";
    if (/scores\.html/i.test(href) || /^mailto:/i.test(href)) continue;
    const frn = param(href, "frn");
    if (frn) return `frn:${frn}`;
  }

  const scoreFrns = [
    ...new Set(
      links
        .map((link) => link.getAttribute?.("href") || "")
        .filter((href) => /scores\.html/i.test(href))
        .map((href) => param(href, "frn"))
        .filter(Boolean),
    ),
  ];
  if (scoreFrns.length === 1) return `frn:${scoreFrns[0]}`;

  return `name:${norm(course)}|${norm(teacher)}`;
}

function preferredText(cell) {
  const links = [...(cell?.querySelectorAll?.("a") || [])];
  const link = links.find((item) => {
    const href = item.getAttribute?.("href") || "";
    return href && !/^mailto:/i.test(href);
  });
  return clean(link?.textContent || cellText(cell));
}

function withLabels(items) {
  const groups = new Map();
  for (const item of items) {
    const group = groups.get(item.course) || [];
    group.push(item);
    groups.set(item.course, group);
  }

  return items.map((item) => {
    const group = groups.get(item.course);
    if (group.length < 2) return { ...item, name: item.course };
    const periods = new Set(group.map((entry) => entry.period).filter(Boolean));
    if (periods.size === group.length && item.period) {
      return { ...item, name: `${item.course} (${item.period})` };
    }
    if (item.teacher) return { ...item, name: `${item.course} (${item.teacher})` };
    if (item.period) return { ...item, name: `${item.course} (${item.period})` };
    return { ...item, name: item.course };
  });
}

export function parseQuickLookup(table) {
  const rows = [...(table?.rows || [])];
  if (!rows.length) return [];

  const headerStart = rows.findIndex(isHeaderRow);
  if (headerStart === -1) return [];

  let headerEnd = headerStart;
  while (headerEnd < rows.length && isHeaderRow(rows[headerEnd])) headerEnd += 1;

  const grid = headerGrid(rows.slice(headerStart, headerEnd));
  const width = grid.reduce((max, row) => Math.max(max, row.length), 0);
  const columns = [];
  for (let column = 0; column < width; column += 1) columns.push(columnInfo(grid, column));

  const courseCol = columns.findIndex((column) => column.role === "course");
  if (courseCol === -1 || !columns.some((column) => column.kind === "grade")) return [];
  const teacherCol = columns.findIndex((column) => column.role === "teacher");
  const periodCol = columns.findIndex((column) => column.role === "period");

  const graded = [];
  for (const row of rows.slice(headerEnd)) {
    const placed = cellsByColumn(row);
    const courseCell = placed[courseCol];
    if (!courseCell) continue;
    const course = preferredText(courseCell);
    if (!course || META_HEADERS.has(headerKey(course))) continue;

    const teacher = teacherCol >= 0 ? clean(cellText(placed[teacherCol])) : "";
    const period = periodCol >= 0 ? clean(cellText(placed[periodCol])) : "";

    let selected = null;
    for (let column = columns.length - 1; column >= 0; column -= 1) {
      if (columns[column]?.kind !== "grade") continue;
      const percent = parsePercent(cellText(placed[column]));
      if (percent == null) continue;
      selected = { percent, term: columns[column].term };
      break;
    }
    if (!selected) continue;

    graded.push({
      id: classId(row, course, teacher),
      course,
      teacher,
      period,
      percent: selected.percent,
      term: selected.term,
    });
  }

  return withLabels(graded).map(({ id, name, percent, term }) => ({ id, name, percent, term }));
}
