import assert from "node:assert/strict";
import test from "node:test";
import { applySnapshot } from "../src/applySnapshot.js";
import "../src/parseGrades.js";

const { parsePercent, parseQuickLookup } = globalThis.gradeTrackerParse;

function decode(text) {
  return text
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function attr(source, name) {
  const match = String(source).match(new RegExp(`${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  return match ? decode(match[2]) : "";
}

function visibleText(html) {
  return decode(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "));
}

function linksFrom(html) {
  const links = [];
  const linkRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match = linkRe.exec(html);
  while (match) {
    const href = attr(match[1], "href");
    links.push({
      textContent: visibleText(match[2]),
      getAttribute(name) {
        return name.toLowerCase() === "href" ? href : null;
      },
    });
    match = linkRe.exec(html);
  }
  return links;
}

export function tableFromHtml(html) {
  const tableMatch = html.match(/<table\b([^>]*)>([\s\S]*?)<\/table>/i);
  if (!tableMatch) throw new Error("fixture is missing a table");
  const rows = [];
  const rowRe = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi;
  let rowMatch = rowRe.exec(tableMatch[2]);
  while (rowMatch) {
    const cells = [];
    const cellRe = /<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
    let cellMatch = cellRe.exec(rowMatch[2]);
    while (cellMatch) {
      const links = linksFrom(cellMatch[3]);
      const text = visibleText(cellMatch[3]);
      cells.push({
        tagName: cellMatch[1].toUpperCase(),
        colSpan: Number(attr(cellMatch[2], "colspan")) || 1,
        rowSpan: Number(attr(cellMatch[2], "rowspan")) || 1,
        textContent: text,
        innerText: text,
        querySelectorAll(selector) {
          return selector === "a" ? links : [];
        },
      });
      cellMatch = cellRe.exec(rowMatch[2]);
    }
    rows.push({ id: attr(rowMatch[1], "id"), cells });
    rowMatch = rowRe.exec(tableMatch[2]);
  }
  return { id: attr(tableMatch[1], "id"), rows };
}

const studentGrades = `
<table id="quickLookup">
  <tr><td colspan="11">Grades and Attendance</td></tr>
  <tr>
    <th rowspan="2">Exp</th>
    <th rowspan="2">Course</th>
    <th rowspan="2">Teacher</th>
    <th colspan="2">Q1</th>
    <th colspan="2">Q2</th>
    <th colspan="2">S1</th>
    <th rowspan="2">Abs</th>
    <th rowspan="2">Tdy</th>
  </tr>
  <tr>
    <th>Grade</th><th></th>
    <th>Grade</th><th></th>
    <th>Grade</th><th></th>
  </tr>
  <tr id="ccid_101">
    <td>1(A)</td>
    <td><a href="home.html?frn=003101">English 9</a></td>
    <td><a href="mailto:s@school.edu">Smith, J</a></td>
    <td><a href="scores.html?frn=031101&amp;fg=Q1">A-<br>91</a></td>
    <td></td>
    <td><a href="scores.html?frn=031201&amp;fg=Q2">B+<br>88</a></td>
    <td>3</td>
    <td></td>
    <td></td>
    <td>2</td>
    <td>0</td>
  </tr>
  <tr id="ccid_202">
    <td>2(A)</td>
    <td><a href="home.html?frn=003202">Algebra 1</a></td>
    <td>Diaz, M</td>
    <td>80</td>
    <td></td>
    <td>84</td>
    <td></td>
    <td><a href="scores.html?frn=031902&amp;fg=S1">B<br>86</a></td>
    <td></td>
    <td>1</td>
    <td>1</td>
  </tr>
  <tr id="ccid_203">
    <td>3(B)</td>
    <td><a href="home.html?frn=003203">Algebra 1</a></td>
    <td>Diaz, M</td>
    <td><a href="scores.html?frn=031203&amp;fg=Q1">A<br>95</a></td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
    <td>0</td>
    <td>0</td>
  </tr>
  <tr id="ccid_404">
    <td>4(A)</td>
    <td>Choir</td>
    <td>Kim, S</td>
    <td>A</td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
    <td>0</td>
    <td>0</td>
  </tr>
  <tr>
    <td>5(A)</td>
    <td>Art</td>
    <td>Ng, P</td>
    <td><a href="scores.html?sectionid=77&amp;fg=Q1">A-<br>90</a></td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
    <td>0</td>
    <td>0</td>
  </tr>
  <tr>
    <td>6(A)</td>
    <td><a href="home.html?frn=003888">Band</a></td>
    <td>Ortiz, L</td>
    <td><a href="scores.html?frn=0311&amp;fg=Q1">88</a></td>
    <td></td>
    <td><a href="scores.html?frn=0312&amp;fg=Q2">91</a></td>
    <td></td>
    <td></td>
    <td></td>
    <td>0</td>
    <td>0</td>
  </tr>
  <tr>
    <td>7(A)</td>
    <td>Health</td>
    <td>Cole, R</td>
    <td></td>
    <td></td>
    <td><a href="scores.html?frn=03142&amp;fg=Q2">100%</a></td>
    <td></td>
    <td></td>
    <td></td>
    <td>4</td>
    <td>0</td>
  </tr>
  <tr id="ccid_300">
    <td>8(A)</td>
    <td>Studio</td>
    <td>Park, E</td>
    <td>A<br>112</td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
    <td>0</td>
    <td>0</td>
  </tr>
  <tr id="ccid_301">
    <td>9(A)</td>
    <td>Drama</td>
    <td>Bell, A</td>
    <td>90</td>
    <td></td>
    <td>200</td>
    <td></td>
    <td></td>
    <td></td>
    <td>0</td>
    <td>0</td>
  </tr>
  <tr>
    <td>10(A)</td>
    <td>PE</td>
    <td>Cole, R</td>
    <td>70</td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
    <td>0</td>
    <td>0</td>
  </tr>
</table>
`;

test("parsePercent reads the percent and skips letter-only grades", () => {
  assert.equal(parsePercent("A-\n91"), 91);
  assert.equal(parsePercent("A- 91"), 91);
  assert.equal(parsePercent("B+ 88.5"), 88.5);
  assert.equal(parsePercent("A+ 98.256"), 98.26);
  assert.equal(parsePercent("95%"), 95);
  assert.equal(parsePercent("95 / 100"), 95);
  assert.equal(parsePercent("112"), 112);
  assert.equal(parsePercent("0"), 0);
  assert.equal(parsePercent("150"), 150);
  assert.equal(parsePercent("A"), null);
  assert.equal(parsePercent("A-"), null);
  assert.equal(parsePercent("200"), null);
  assert.equal(parsePercent("150.01"), null);
  assert.equal(parsePercent(""), null);
  assert.equal(parsePercent("\u00a0"), null);
});

test("student quick lookup keeps the current term percent for each class", () => {
  const grades = parseQuickLookup(tableFromHtml(studentGrades));
  const byId = Object.fromEntries(grades.map((grade) => [grade.id, grade]));

  assert.equal(grades.length, 9);
  assert.equal(new Set(grades.map((grade) => grade.id)).size, 9);
  assert.equal(grades.some((grade) => grade.name === "Choir"), false);

  assert.deepEqual(byId["ccid:101"], { id: "ccid:101", name: "English 9", percent: 88, term: "Q2" });
  assert.deepEqual(byId["ccid:202"], {
    id: "ccid:202",
    name: "Algebra 1 (2(A))",
    percent: 86,
    term: "S1",
  });
  assert.deepEqual(byId["ccid:203"], {
    id: "ccid:203",
    name: "Algebra 1 (3(B))",
    percent: 95,
    term: "Q1",
  });
  assert.deepEqual(byId["section:77"], { id: "section:77", name: "Art", percent: 90, term: "Q1" });
  assert.deepEqual(byId["frn:003888"], { id: "frn:003888", name: "Band", percent: 91, term: "Q2" });
  assert.deepEqual(byId["frn:03142"], { id: "frn:03142", name: "Health", percent: 100, term: "Q2" });
  assert.deepEqual(byId["ccid:300"], { id: "ccid:300", name: "Studio", percent: 112, term: "Q1" });
  assert.deepEqual(byId["ccid:301"], { id: "ccid:301", name: "Drama", percent: 90, term: "Q1" });
  assert.deepEqual(byId["name:pe|cole, r"], { id: "name:pe|cole, r", name: "PE", percent: 70, term: "Q1" });
});

test("a single header row ignores an empty later term and absences", () => {
  const grades = parseQuickLookup(
    tableFromHtml(`
      <table id="quickLookup">
        <tr><th>Course</th><th>Teacher</th><th>Q1</th><th>Q2</th><th>Absences</th></tr>
        <tr><td>History</td><td>Adeyemi</td><td>82</td><td></td><td>6</td></tr>
      </table>
    `),
  );
  assert.deepEqual(grades, [{ id: "name:history|adeyemi", name: "History", percent: 82, term: "Q1" }]);
});

test("tables without a grades header contribute nothing", () => {
  assert.deepEqual(parseQuickLookup(null), []);
  assert.deepEqual(parseQuickLookup(tableFromHtml("<table><tr><td>Hi</td></tr></table>")), []);
});

test("applySnapshot stores a baseline and appends when the local day or percent changes", () => {
  const empty = { classes: {}, hiddenClassIds: ["keep"] };
  const first = applySnapshot(
    empty,
    { classes: [{ id: "a", name: "Art", percent: 90, term: "Q1" }] },
    "2026-10-01T00:00:00.000Z",
  );

  assert.equal(empty.classes.a, undefined);
  assert.deepEqual(first.hiddenClassIds, ["keep"]);
  assert.deepEqual(first.classes.a, {
    id: "a",
    name: "Art",
    lastSeen: "2026-10-01T00:00:00.000Z",
    points: [{ t: "2026-10-01T00:00:00.000Z", percent: 90, term: "Q1" }],
  });

  const same = applySnapshot(
    first,
    { classes: [{ id: "a", name: "Art 1", percent: 90, term: "Q1" }] },
    "2026-10-05T00:00:00.000Z",
  );
  assert.equal(same.classes.a.name, "Art 1");
  assert.equal(same.classes.a.lastSeen, "2026-10-05T00:00:00.000Z");
  assert.deepEqual(same.classes.a.points, [
    { t: "2026-10-01T00:00:00.000Z", percent: 90, term: "Q1" },
    { t: "2026-10-05T00:00:00.000Z", percent: 90, term: "Q1" },
  ]);
  assert.equal(first.classes.a.points.length, 1);

  const changed = applySnapshot(
    same,
    { classes: [{ id: "a", name: "Art 1", percent: 93, term: "Q2" }] },
    "2026-10-20T00:00:00.000Z",
  );
  assert.deepEqual(changed.classes.a.points, [
    { t: "2026-10-01T00:00:00.000Z", percent: 90, term: "Q1" },
    { t: "2026-10-05T00:00:00.000Z", percent: 90, term: "Q1" },
    { t: "2026-10-20T00:00:00.000Z", percent: 93, term: "Q2" },
  ]);
  assert.equal(same.classes.a.points.length, 2);

  const withBio = applySnapshot(
    changed,
    { classes: [{ id: "b", name: "Biology", percent: 0, term: "Q2" }] },
    "2026-10-21T00:00:00.000Z",
  );
  assert.equal(withBio.classes.a.points.length, 3);
  assert.equal(withBio.classes.b.points[0].percent, 0);

  const back = applySnapshot(
    withBio,
    { classes: [{ id: "a", name: "Art 1", percent: 90, term: "Q2" }] },
    "2026-11-01T00:00:00.000Z",
  );
  assert.equal(back.classes.a.points.length, 4);
  assert.equal(back.classes.a.points[3].percent, 90);
  assert.deepEqual(back.hiddenClassIds, ["keep"]);

  const skipped = applySnapshot(
    back,
    { classes: [{ id: "z", name: "Drama", percent: 200, term: "Q1" }] },
    "2026-11-02T00:00:00.000Z",
  );
  assert.equal(skipped.classes.z, undefined);
  assert.equal(skipped.classes.a.points.length, 4);
});

test("applySnapshot skips a second point on the same local day when the percent is unchanged", () => {
  const morning = new Date(2026, 10, 8, 9).toISOString();
  const afternoon = new Date(2026, 10, 8, 16).toISOString();
  const nextMorning = new Date(2026, 10, 9, 9).toISOString();
  const snapshot = { classes: [{ id: "a", name: "Art", percent: 90, term: "Q1" }] };

  const first = applySnapshot({ classes: {}, hiddenClassIds: [] }, snapshot, morning);
  const later = applySnapshot(first, snapshot, afternoon);
  assert.equal(later.classes.a.points.length, 1);
  assert.equal(later.classes.a.lastSeen, afternoon);

  const tomorrow = applySnapshot(later, snapshot, nextMorning);
  assert.equal(tomorrow.classes.a.points.length, 2);
  assert.equal(tomorrow.classes.a.points[1].t, nextMorning);
});
