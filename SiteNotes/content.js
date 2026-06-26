// SiteNotes content script (Step 4): notes are draggable, editable, deletable,
// and recolourable — every change persisted.
//
// Uses the storage.js helpers (keyForUrl / getNotes / saveNotes) — already in
// scope because storage.js is listed before content.js in the manifest.
//
// Persistence rule (project invariant): before ANY mutation, RE-FETCH with
// getNotes (storage may have changed in another tab / via the popup), modify the
// fresh array, then saveNotes. Never write back a stale in-memory array. The
// note `id` is the stable key throughout.

// Four light, high-contrast sticky colours (dark text passes AA on each).
const SN_COLORS = ["#fff59d", "#c5e1a5", "#b3e5fc", "#f8bbd0"];
const SN_DEFAULT_COLOR = SN_COLORS[0];

// Page-session visibility state for SN_TOGGLE_ALL. Lives as long as the content
// script does — the popup has no memory between opens, but this does.
let snAllHidden = false;

// Generate a unique note id. crypto.randomUUID() only exists in SECURE contexts
// (https / localhost), so on a plain http:// page it's undefined and would throw
// — fall back to getRandomValues, then to a timestamp+random as a last resort.
function snUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0"));
    return (
      h[0] + h[1] + h[2] + h[3] + "-" + h[4] + h[5] + "-" + h[6] + h[7] +
      "-" + h[8] + h[9] + "-" + h[10] + h[11] + h[12] + h[13] + h[14] + h[15]
    );
  }
  return "sn-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

// --- extension-context resilience -------------------------------------------
//
// Reloading/updating the extension ORPHANS content scripts already on a page:
// chrome.runtime.id becomes undefined and any chrome.* call throws "Extension
// context invalidated". The buttons stay on the page but every click fails
// silently — nothing happens, nothing saves. Detect that and tell the user to
// reload the page, instead of failing quietly.
function snContextOk() {
  try {
    return !!(chrome.runtime && chrome.runtime.id);
  } catch (e) {
    return false;
  }
}

function snNotifyReload() {
  if (!document.body || document.querySelector(".sitenotes-reload-notice")) return;
  const notice = document.createElement("div");
  notice.className = "sitenotes-reload-notice";
  notice.setAttribute("role", "alert");
  notice.textContent = "SiteNotes was updated — reload this page to use your notes.";
  document.body.appendChild(notice);
}

// --- storage mutators (always re-fetch first) --------------------------------

// Re-fetch, find the note by id, apply `mutator(note)`, write back.
async function snUpdateNote(id, mutator) {
  if (!snContextOk()) return snNotifyReload();
  try {
    const notes = await getNotes(location.href);
    const note = notes.find((n) => n.id === id);
    if (!note) return; // already deleted elsewhere — nothing to update
    mutator(note);
    await saveNotes(location.href, notes);
  } catch (e) {
    console.warn("SiteNotes: could not save change —", e);
    snNotifyReload();
  }
}

// Re-fetch, drop the note with this id, write back.
async function snDeleteNote(id) {
  if (!snContextOk()) return snNotifyReload();
  try {
    const notes = await getNotes(location.href);
    await saveNotes(location.href, notes.filter((n) => n.id !== id));
  } catch (e) {
    console.warn("SiteNotes: could not delete note —", e);
    snNotifyReload();
  }
}

// --- rendering + wiring ------------------------------------------------------

// Build (but don't insert) the DOM for a single note, with all handlers wired
// exactly once. Per-note state lives in this closure.
function snBuildNoteElement(note) {
  let currentColor = note.color || SN_DEFAULT_COLOR;
  let editTimer = null;

  const el = document.createElement("div");
  el.className = "sitenotes-note";
  el.setAttribute("data-sn-id", note.id);
  el.setAttribute("role", "group");
  el.setAttribute("aria-label", "Note");
  el.style.left = note.x + "px";
  el.style.top = note.y + "px";
  el.style.background = currentColor;

  // Header bar = drag handle.
  const header = document.createElement("div");
  header.className = "sitenotes-note-header";

  // Colour swatch is a real button so it's keyboard-operable.
  const swatch = document.createElement("button");
  swatch.type = "button";
  swatch.className = "sitenotes-note-swatch";
  swatch.style.background = currentColor;
  swatch.setAttribute("aria-label", "Change note colour");

  const del = document.createElement("button");
  del.type = "button";
  del.className = "sitenotes-note-delete";
  del.setAttribute("aria-label", "Delete note");
  del.textContent = "×";

  header.appendChild(swatch);
  header.appendChild(del);

  const text = document.createElement("textarea");
  text.className = "sitenotes-note-text";
  text.setAttribute("aria-label", "Note text");
  text.value = note.text || ""; // .value, never innerHTML — host text stays inert

  el.appendChild(header);
  el.appendChild(text);

  // DRAG: pointerdown on the header (but not on the controls inside it) starts a
  // drag. Document-level move/up listeners are added now and removed on up, so
  // they never accumulate or double-bind.
  header.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !e.isPrimary) return;
    if (e.target.closest(".sitenotes-note-delete, .sitenotes-note-swatch")) return;
    e.preventDefault(); // suppress text selection / focus shift while dragging

    const rect = el.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    let lastLeft = rect.left;
    let lastTop = rect.top;
    el.classList.add("sitenotes-note--dragging");

    const onMove = (ev) => {
      const maxLeft = Math.max(0, window.innerWidth - el.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - el.offsetHeight);
      lastLeft = Math.min(Math.max(0, ev.clientX - offsetX), maxLeft);
      lastTop = Math.min(Math.max(0, ev.clientY - offsetY), maxTop);
      el.style.left = lastLeft + "px";
      el.style.top = lastTop + "px";
    };

    // Shared end handler: also runs on pointercancel (touch interruption,
    // browser gesture) so the document listeners can never leak and the note
    // can't get stuck in the dragging state.
    const onEnd = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onEnd);
      document.removeEventListener("pointercancel", onEnd);
      el.classList.remove("sitenotes-note--dragging");
      snUpdateNote(note.id, (n) => {
        n.x = Math.round(lastLeft);
        n.y = Math.round(lastTop);
      });
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onEnd);
    document.addEventListener("pointercancel", onEnd);
  });

  // EDIT: debounce so storage isn't hammered per keystroke (~400ms).
  text.addEventListener("input", () => {
    clearTimeout(editTimer);
    editTimer = setTimeout(() => {
      snUpdateNote(note.id, (n) => {
        n.text = text.value;
      });
    }, 400);
  });

  // COLOUR: cycle through the light palette, persist the new colour.
  swatch.addEventListener("click", () => {
    const idx = SN_COLORS.indexOf(currentColor);
    currentColor = SN_COLORS[(idx + 1) % SN_COLORS.length];
    el.style.background = currentColor;
    swatch.style.background = currentColor;
    snUpdateNote(note.id, (n) => {
      n.color = currentColor;
    });
  });

  // DELETE: cancel any pending debounced save, drop from DOM, drop from storage.
  // Removing the element destroys the focused button, so move focus to the
  // launcher to keep keyboard/screen-reader users oriented (never stranded on
  // <body>). :focus-visible keeps the ring keyboard-only.
  del.addEventListener("click", () => {
    clearTimeout(editTimer);
    el.remove();
    const launcher = document.querySelector(".sitenotes-launcher");
    if (launcher) launcher.focus();
    snDeleteNote(note.id);
  });

  // Respect the current page-session visibility state for freshly built notes.
  if (snAllHidden) el.classList.add("sitenotes-note--hidden");

  return el;
}

// Insert one note, but only if it isn't already on the page (idempotent by id).
// Because building is the only place handlers are bound, this guard also
// guarantees a note's handlers are never bound twice on re-render.
function snRenderNote(note) {
  if (!document.body) return;
  if (document.querySelector('.sitenotes-note[data-sn-id="' + note.id + '"]')) return;
  document.body.appendChild(snBuildNoteElement(note));
}

// Render every saved note for the current URL.
async function snRenderNotes() {
  const notes = await getNotes(location.href);
  for (const note of notes) snRenderNote(note);
}

// Inject the floating add-note launcher once.
function snInjectLauncher() {
  if (!document.body) return;
  if (document.querySelector(".sitenotes-launcher")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "sitenotes-launcher";
  btn.setAttribute("aria-label", "Add a note to this page");
  btn.textContent = "+ Note";
  btn.addEventListener("click", snCreateNote);
  document.body.appendChild(btn);
}

// Create a new blank note: re-fetch fresh, append, persist, then render it.
async function snCreateNote() {
  if (!snContextOk()) return snNotifyReload();
  const note = {
    id: snUuid(),
    text: "",
    color: SN_DEFAULT_COLOR,
    x: 80,
    y: 80,
    collapsed: false
  };
  try {
    const notes = await getNotes(location.href);
    notes.push(note);
    await saveNotes(location.href, notes);
    snRenderNote(note);
  } catch (e) {
    console.warn("SiteNotes: could not create note —", e);
    snNotifyReload();
  }
}

// Remove every note element we've rendered (used before re-rendering on nav).
function snClearRenderedNotes() {
  const existing = document.querySelectorAll(".sitenotes-note");
  for (const el of existing) el.remove();
}

// Apply the current page-session visibility state to all notes on the page.
function snApplyHiddenState() {
  const notes = document.querySelectorAll(".sitenotes-note");
  for (const el of notes) el.classList.toggle("sitenotes-note--hidden", snAllHidden);
}

// Reveal (if hidden), scroll to, and focus a note's text area by id.
function snFocusNote(id) {
  if (!id) return;
  const el = document.querySelector('.sitenotes-note[data-sn-id="' + id + '"]');
  if (!el) return;
  el.classList.remove("sitenotes-note--hidden"); // can't focus a display:none note
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  const text = el.querySelector(".sitenotes-note-text");
  if (text) text.focus();
}

// Messages from the service worker and the popup.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;
  switch (message.type) {
    case "SN_RERENDER":
      // URL changed (e.g. SPA nav): drop old notes, render notes for the new URL.
      snClearRenderedNotes();
      snRenderNotes();
      return;
    case "SN_ADD_NOTE":
      // Same as clicking the launcher.
      snCreateNote();
      return;
    case "SN_TOGGLE_ALL":
      snAllHidden = !snAllHidden;
      snApplyHiddenState();
      return;
    case "SN_FOCUS_NOTE":
      snFocusNote(message.id);
      return;
    case "SN_GET_COUNT":
      // Async sendResponse → return true to keep the message channel open.
      sendResponse({ count: document.querySelectorAll(".sitenotes-note").length });
      return true;
    default:
      return;
  }
});

// Idempotent entry point — safe to run on initial load AND again on SPA
// re-render (SN_RERENDER). Guards above make a double run a no-op.
async function snInit() {
  snInjectLauncher();
  await snRenderNotes();
}

snInit();
