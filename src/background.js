import { applySnapshot } from "./applySnapshot.js";

let chain = Promise.resolve();

function fromStudentPortal(sender) {
  if (!sender || sender.id !== chrome.runtime.id) return false;
  try {
    const host = new URL(sender.url || "").hostname;
    return host === "powerschool.com" || host.endsWith(".powerschool.com");
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "grades-snapshot" || !Array.isArray(message.classes)) return;
  if (!fromStudentPortal(sender)) return;

  const classes = message.classes;
  const reply = (payload) => {
    try {
      sendResponse(payload);
    } catch {
      // The grades page navigated away before the save finished.
    }
  };
  chain = chain
    .then(async () => {
      const store = await chrome.storage.local.get({ classes: {}, hiddenClassIds: [] });
      const next = applySnapshot(store, { classes }, new Date().toISOString());
      await chrome.storage.local.set(next);
      reply({ ok: true });
    })
    .catch(() => {
      reply({ ok: false });
    });
  return true;
});
