import { parseQuickLookup } from "./parseGrades.js";

// Students usually land on Grades and Attendance. Many districts still serve
// that page from /guardian/home.html; the path name is historical.
function findTable(doc) {
  const tables = doc.querySelectorAll("table");
  for (const table of tables) {
    if ((table.id || "").toLowerCase() === "quicklookup") return table;
  }
  for (const table of tables) {
    const html = table.innerHTML || "";
    if (/scores\.html/i.test(html) && /course/i.test(html)) return table;
  }
  return null;
}

let lastKey = "";
let reportTimer = 0;
let stopTimer = 0;
let observer = null;

function report() {
  try {
    const table = findTable(document);
    if (!table) return;
    const classes = parseQuickLookup(table).map(({ id, name, percent, term }) => ({
      id,
      name,
      percent,
      term,
    }));
    if (!classes.length) return;

    const key = JSON.stringify(classes);
    if (key === lastKey) return;
    lastKey = key;

    const sent = chrome.runtime.sendMessage({ type: "grades-snapshot", classes });
    if (!sent || typeof sent.then !== "function") return;
    sent
      .then((response) => {
        if (!response?.ok) {
          if (lastKey === key) lastKey = "";
          return;
        }
        window.clearTimeout(stopTimer);
        stopTimer = window.setTimeout(() => observer?.disconnect(), 2000);
      })
      .catch(() => {
        if (lastKey === key) lastKey = "";
      });
  } catch {
    // An unfamiliar grades page should not break PowerSchool.
  }
}

function schedule() {
  window.clearTimeout(reportTimer);
  reportTimer = window.setTimeout(report, 400);
}

report();
window.addEventListener("load", report, { once: true });
if (document.documentElement) {
  observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(() => observer?.disconnect(), 15000);
}
