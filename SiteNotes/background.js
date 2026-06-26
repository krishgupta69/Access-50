// SiteNotes service worker (Step 5).
//
// NO DOM here — a service worker has no document/window. This file only listens
// for tab/command events and forwards messages to the content script.
//
// Listeners are registered SYNCHRONOUSLY at the top level so they're active the
// moment the worker spins up (MV3 may wake it just to deliver an event).

// Send a message to a tab's content script, swallowing the expected failure on
// tabs that have no content script (chrome://, the Web Store, etc.). The
// try/catch covers synchronous throws; the .catch() covers the async rejection
// ("Could not establish connection / Receiving end does not exist").
function snSendToTab(tabId, message) {
  try {
    chrome.tabs.sendMessage(tabId, message).catch(() => {});
  } catch (e) {
    /* no content script on this tab — ignore */
  }
}

function snIsHttp(url) {
  return typeof url === "string" && /^https?:/i.test(url);
}

// Follow SPA URL changes (and full loads): when a tab's URL changes or it
// finishes loading, ask its content script to re-render notes for the new URL.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== "complete") return;
  const url = changeInfo.url || (tab && tab.url);
  if (!snIsHttp(url)) return;
  snSendToTab(tabId, { type: "SN_RERENDER" });
});

// Keyboard command (Alt+Shift+N): add a note to the active tab.
chrome.commands.onCommand.addListener((command) => {
  if (command !== "add-note") return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || typeof tab.id !== "number" || !snIsHttp(tab.url)) return;
    snSendToTab(tab.id, { type: "SN_ADD_NOTE" });
  });
});
