// BigCursor popup — loads settings fresh on every open, pushes a LIVE update to
// the active tab on every change, and persists to storage on a debounce.
//
// Why the split: chrome.storage.sync limits writes (~120/min). Dragging a slider
// fires "input" many times per second, so writing storage on every tick blows
// the MAX_WRITE_OPERATIONS_PER_MINUTE quota. Messaging the content script has no
// such quota, so the page can update on every tick while storage is written only
// once the value settles / is committed.

const STORAGE_KEY = "bigcursor_settings";
const DEFAULTS = {
  enabled: true,
  cursorSize: 48,
  haloSize: 60,
  haloColor: "#38bdf8",
  haloOpacity: 0.5,
};

async function getSettings() {
  try {
    const o = await chrome.storage.sync.get(STORAGE_KEY);
    return { ...DEFAULTS, ...(o[STORAGE_KEY] || {}) };
  } catch (e) {
    // Storage unavailable — fall back to defaults so the popup never opens blank.
    return { ...DEFAULTS };
  }
}

// The active tab doesn't change while the popup is open, so resolve it once.
let activeTabId = null;

// Live preview: tell the content script to re-apply now. No storage, no quota.
// Message contract (verbatim): { type: "BIGCURSOR_APPLY", settings }.
async function pushLive(settings) {
  if (activeTabId == null) return;
  try {
    await chrome.tabs.sendMessage(activeTabId, { type: "BIGCURSOR_APPLY", settings });
  } catch (e) {
    // No content script on this page (chrome://, Web Store, etc.) — ignore.
  }
}

// Persist to chrome.storage.sync. Only called on a debounce / on commit — never
// on every drag tick. Wrapped so a quota error can't become an uncaught
// rejection; the live preview already happened and the next commit will retry.
async function persist(settings) {
  try {
    await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
  } catch (e) {
    /* over quota or unavailable — safe to drop; the committed value wins next */
  }
}

let saveTimer = null;
function scheduleSave(settings) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persist(settings), 400);
}
function flushSave(settings) {
  clearTimeout(saveTimer);
  persist(settings);
}

// --- Control wiring -------------------------------------------------------

const els = {};

const INPUT_IDS = ["enabled", "cursorSize", "haloSize", "haloColor", "haloOpacity"];

function readForm() {
  return {
    enabled: els.enabled.checked,
    cursorSize: Number(els.cursorSize.value),
    haloSize: Number(els.haloSize.value),
    haloColor: els.haloColor.value,
    haloOpacity: Number(els.haloOpacity.value),
  };
}

function paintLabels(s) {
  els.cursorSizeValue.textContent = s.cursorSize + "px";
  els.haloSizeValue.textContent = s.haloSize + "px";
  els.haloOpacityValue.textContent = Math.round(s.haloOpacity * 100) + "%";
  els.controls.classList.toggle("is-disabled", !s.enabled);
}

function fillForm(s) {
  els.enabled.checked = s.enabled;
  els.cursorSize.value = s.cursorSize;
  els.haloSize.value = s.haloSize;
  els.haloColor.value = s.haloColor;
  els.haloOpacity.value = s.haloOpacity;
  paintLabels(s);
}

// Fires continuously while dragging: update the label + live preview every tick,
// but only schedule a (debounced) storage write.
function onInput() {
  const s = readForm();
  paintLabels(s);
  pushLive(s);
  scheduleSave(s);
}

// Fires once when the control is committed (slider released, color chosen,
// toggle flipped): persist the final value immediately.
function onCommit() {
  flushSave(readForm());
}

document.addEventListener("DOMContentLoaded", async () => {
  [
    "enabled",
    "cursorSize",
    "haloSize",
    "haloColor",
    "haloOpacity",
    "cursorSizeValue",
    "haloSizeValue",
    "haloOpacityValue",
    "controls",
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });

  // Resolve the active tab once for live messaging.
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTabId = tab && tab.id != null ? tab.id : null;
  } catch (e) {
    activeTabId = null;
  }

  // Fresh from storage every open — never assume leftover state.
  fillForm(await getSettings());

  INPUT_IDS.forEach((id) => {
    els[id].addEventListener("input", onInput);
    els[id].addEventListener("change", onCommit);
  });
});
