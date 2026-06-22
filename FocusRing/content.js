// FocusRing — content script
//
// The entire extension is ONE injected <style> tag (id="focusring-style") that
// forces a bold, high-contrast focus ring on every focused element, defeating
// sites that hide their focus styles. Settings come from chrome.storage.sync, so
// they persist across pages/sessions and sync across devices.
//
// Design note — idle CPU is effectively zero. (#7) There is NO MutationObserver,
// NO setInterval/setTimeout loop, and NO per-element listeners. We register only:
//   - chrome.runtime.onMessage  (popup -> live re-apply)
//   - chrome.storage.onChanged  (sync -> live re-apply across tabs/devices)
//   - one { once: true } DOMContentLoaded fallback when run at document_start
// The CSS pseudo-classes (:focus / :focus-visible) do all the per-element work
// for free, so there is nothing to poll. Do not add observers or timers.
//
// Shadow DOM caveat. (#1) Document-level CSS does NOT pierce closed shadow roots,
// so web components using a closed shadow DOM won't receive the ring from this
// single style tag. This is a known, accepted limitation: walking and injecting
// into every shadow root is expensive and fragile, so we deliberately do not.
//
// Iframes. (#5) The manifest sets all_frames:true, so Chrome injects this script
// once per frame. The code makes no top-only assumptions and never touches
// window.top — it operates only on its own document. Each same-origin frame (and
// any cross-origin frame the user navigates into) gets its own ring independently.

const DEFAULTS = {
  enabled: true,
  color: "#facc15",
  thickness: 4,
  offset: 2,
  style: "solid",
  glow: true,
};

const STYLE_ID = "focusring-style";
const STORAGE_KEY = "focusring_settings";

// --- Storage helpers (same key + shape reused by the popup) -----------------

// Merge stored values over DEFAULTS so any missing field falls back safely.
async function getSettings() {
  const o = await chrome.storage.sync.get(STORAGE_KEY);
  return { ...DEFAULTS, ...(o[STORAGE_KEY] || {}) };
}

async function saveSettings(s) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: s });
}

// --- CSS --------------------------------------------------------------------

// Build the CSS string for the injected <style> tag.
function buildCSS(settings) {
  const { color, thickness, offset, style, glow } = settings;

  // Soft double halo built from the ring colour at low alpha (8-digit hex).
  const shadow = glow
    ? `0 0 0 ${thickness + 2}px ${color}55, 0 0 ${thickness * 2}px ${color}88`
    : "none";

  // Main rule. Targets ONLY :focus-visible (modern, keyboard-only — does not
  // fire on a plain mouse click) and :focus (fallback for older sites). We do
  // NOT use :focus-within on purpose (#4) — that would paint one big ring around
  // an entire container whenever any descendant is focused.
  //
  // !important is REQUIRED and CORRECT here — DO NOT "clean it up". Sites hide
  // focus with high-specificity `outline: none`, and some set focus styling
  // inline via a [style] attribute. !important on outline + box-shadow beats
  // BOTH inline styles and high-specificity rules (#3), which is the entire
  // reason this extension works. This is the one legitimate use of !important.
  return `:focus-visible, :focus {
  outline: ${thickness}px ${style} ${color} !important;
  outline-offset: ${offset}px !important;
  box-shadow: ${shadow} !important;
  border-radius: 2px;
}

/* SVG focus is best-effort (#2). Interactive SVG nodes (<a>, focusable <g> or
   anything with [tabindex], and <foreignObject>) frequently ignore 'outline',
   so we add a coloured stroke as a fallback — but ONLY for the genuinely
   interactive ones, never 'svg *', which would repaint every shape in an icon.
   The box-shadow halo above also still appears around the host in most browsers. */
svg a:focus-visible, svg a:focus,
svg [tabindex]:focus-visible, svg [tabindex]:focus,
svg foreignObject:focus-visible, svg foreignObject:focus {
  stroke: ${color} !important;
  stroke-width: ${thickness}px !important;
}`;
}

// --- Apply ------------------------------------------------------------------

// Apply the given settings to the page. Idempotent: it reuses the existing
// element, so running twice (SPA re-render, repeated messages) never makes a
// second style tag.
function apply(settings) {
  const existing = document.getElementById(STYLE_ID);

  // enabled:false must fully clean up (#6): remove the style tag entirely so the
  // site's own focus styles return — we leave no residue behind.
  if (!settings.enabled) {
    if (existing) existing.remove();
    return;
  }

  let el = existing;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    (document.head || document.documentElement).appendChild(el);
  }
  el.textContent = buildCSS(settings);
}

// --- Live updates -----------------------------------------------------------

// Popup -> content: re-apply the moment a control changes (no page reload).
// Reuse the existing apply() so live behaviour matches the on-load path exactly.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "FOCUSRING_APPLY") {
    apply(msg.settings);
  }
});

// chrome.storage.sync -> content: other tabs / other devices changing the
// setting (via sync) re-apply here too, without a reload. Same apply() path.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes[STORAGE_KEY]) {
    apply({ ...DEFAULTS, ...(changes[STORAGE_KEY].newValue || {}) });
  }
});

// --- Init -------------------------------------------------------------------

// Because we run at document_start, the mount point may not exist yet.
// If neither <head> nor <documentElement> is ready, wait for DOMContentLoaded
// then run apply(settings); otherwise apply immediately.
async function init() {
  const settings = await getSettings();

  if (document.head || document.documentElement) {
    apply(settings);
  } else {
    document.addEventListener("DOMContentLoaded", () => apply(settings), {
      once: true,
    });
  }
}

init();
