// SiteNotes popup (Step 6): control surface for the active tab.
//
// The popup opens fresh every time and keeps NO memory between opens, so all
// state is loaded on open. storage.js is loaded before this file, so getNotes()
// is in scope — we read the active tab's notes directly (one consistent source
// for both the count and the list) and talk to the content script over
// chrome.tabs.sendMessage for actions.

document.addEventListener("DOMContentLoaded", snPopupInit);

async function snGetActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function snIsHttp(url) {
  return typeof url === "string" && /^https?:/i.test(url);
}

// First non-empty line of a note, used as the list label.
function snNoteLabel(note) {
  const firstLine = (note.text || "").split("\n")[0].trim();
  return firstLine || "(empty note)";
}

async function snPopupInit() {
  const tab = await snGetActiveTab();
  const blocked = document.getElementById("sn-blocked");
  const main = document.getElementById("sn-main");

  // Non-http(s) page (chrome://, the Web Store, a local file, etc.): friendly
  // empty state, then stop — there's no content script to talk to.
  if (!tab || !snIsHttp(tab.url)) {
    blocked.hidden = false;
    return;
  }

  main.hidden = false;

  const notes = await getNotes(tab.url); // shared storage, keyed off the tab URL
  snRenderCount(notes.length);
  snRenderList(tab, notes);
  snWireActions(tab);
}

function snRenderCount(n) {
  const el = document.getElementById("sn-count");
  if (n === 0) el.textContent = "No notes yet";
  else if (n === 1) el.textContent = "1 note on this page";
  else el.textContent = n + " notes on this page";
}

function snRenderList(tab, notes) {
  const list = document.getElementById("sn-list");
  list.textContent = ""; // rebuilt fresh on every open
  for (const note of notes) {
    const li = document.createElement("li");
    li.className = "sitenotes-popup-list-item";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sitenotes-popup-list-btn";
    btn.setAttribute("aria-label", "Focus note: " + snNoteLabel(note));

    const dot = document.createElement("span");
    dot.className = "sitenotes-popup-dot";
    dot.style.background = note.color || "#fff59d";
    dot.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "sitenotes-popup-label";
    label.textContent = snNoteLabel(note); // textContent — never innerHTML

    btn.appendChild(dot);
    btn.appendChild(label);
    btn.addEventListener("click", () => {
      // Only close once the message actually reaches the content script; if the
      // page is unreachable (needs a reload), show the hint instead.
      chrome.tabs.sendMessage(tab.id, { type: "SN_FOCUS_NOTE", id: note.id })
        .then(() => window.close())
        .catch(snShowHint);
    });

    li.appendChild(btn);
    list.appendChild(li);
  }
}

function snSetHint(visible) {
  const hint = document.getElementById("sn-hint");
  if (hint) hint.hidden = !visible;
}

function snShowHint() {
  snSetHint(true);
}

function snWireActions(tab) {
  document.getElementById("sn-add").addEventListener("click", () => {
    snSetHint(false);
    // Close only if the note was actually created on the page; otherwise the
    // page can't be reached (reload needed) — keep the popup open and explain.
    chrome.tabs.sendMessage(tab.id, { type: "SN_ADD_NOTE" })
      .then(() => window.close())
      .catch(snShowHint);
  });

  document.getElementById("sn-toggle").addEventListener("click", () => {
    // Visibility state lives in the page (content script), not in the popup —
    // fire the toggle and leave the popup open for repeated use.
    chrome.tabs.sendMessage(tab.id, { type: "SN_TOGGLE_ALL" }).catch(snShowHint);
  });
}
