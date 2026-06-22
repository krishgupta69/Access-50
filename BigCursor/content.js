console.log("BigCursor content script loaded");

(function () {
  "use strict";

  // --- Storage contract -----------------------------------------------------
  // One key in chrome.storage.sync, JSON-serialisable values, merged over
  // DEFAULTS so any missing field falls back. The same key + shape are reused
  // by the popup in a later step.
  const STORAGE_KEY = "bigcursor_settings";
  const DEFAULTS = {
    enabled: true,
    cursorSize: 48,
    haloSize: 60,
    haloColor: "#38bdf8",
    haloOpacity: 0.5,
  };

  async function getSettings() {
    const o = await chrome.storage.sync.get(STORAGE_KEY);
    return { ...DEFAULTS, ...(o[STORAGE_KEY] || {}) };
  }

  async function saveSettings(settings) {
    await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
  }

  const STYLE_ID = "bigcursor-style";
  const HALO_ID = "bigcursor-halo";

  // Chrome ignores custom cursors larger than 128x128 and falls back to default.
  const MAX_CURSOR = 128;

  // --- Helpers --------------------------------------------------------------

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  // "#rrggbb" -> { r, g, b }. Falls back to the default halo color on bad input.
  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    const value = m ? m[1] : "38bdf8";
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
    };
  }

  function rgba(rgb, alpha) {
    return "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + "," + alpha + ")";
  }

  // Arrow-pointer SVG sized to `size`, tip anchored at (0,0) so the hotspot lines up.
  function buildCursorDataUri(size) {
    const svg =
      "<svg xmlns='http://www.w3.org/2000/svg' width='" +
      size +
      "' height='" +
      size +
      "' viewBox='0 0 22 22'>" +
      "<path d='M0,0 L0,17 L4,13 L7,19.5 L9.5,18.5 L6.3,12.3 L11,12.3 Z' " +
      "fill='#ffffff' stroke='#1e293b' stroke-width='1.5' stroke-linejoin='round'/>" +
      "</svg>";
    return "data:image/svg+xml," + encodeURIComponent(svg);
  }

  // --- Enlarged cursor ------------------------------------------------------

  function ensureStyle(settings) {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }

    const size = clamp(settings.cursorSize, 1, MAX_CURSOR);
    const uri = buildCursorDataUri(size);

    style.textContent =
      "*, *::before, *::after { cursor: url(\"" +
      uri +
      "\") 0 0, auto !important; }";
  }

  function removeStyle() {
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
  }

  // --- Halo -----------------------------------------------------------------

  function ensureHalo(settings) {
    let halo = document.getElementById(HALO_ID);
    if (!halo) {
      halo = document.createElement("div");
      halo.id = HALO_ID;
      document.documentElement.appendChild(halo);
    }

    const rgb = hexToRgb(settings.haloColor);
    const op = clamp(settings.haloOpacity, 0, 1);
    const ring =
      "radial-gradient(circle, " +
      rgba(rgb, 0) + " 35%, " +
      rgba(rgb, op) + " 60%, " +
      rgba(rgb, 0) + " 100%)";

    const s = halo.style;
    s.position = "fixed";
    s.left = "0";
    s.top = "0";
    s.width = settings.haloSize + "px";
    s.height = settings.haloSize + "px";
    s.borderRadius = "50%";
    s.background = ring;
    s.pointerEvents = "none";
    s.zIndex = "2147483647";
    s.willChange = "transform";
    // Track 1:1 — no easing/lag. Pinning transition:none also stops a page's
    // global `* { transition: ... }` from making the halo lag, which keeps us
    // honest with prefers-reduced-motion by construction.
    s.transition = "none";
    // Center on the mouse point; the rAF loop appends the position translate.
    if (!s.transform) s.transform = "translate(-50%, -50%)";

    return halo;
  }

  function removeHalo() {
    const halo = document.getElementById(HALO_ID);
    if (halo) halo.remove();
  }

  // --- Apply ----------------------------------------------------------------
  // Single source of truth: read everything the cursor + halo need from the
  // settings object. Idempotent — reuses #bigcursor-style / #bigcursor-halo.
  // The latest settings are cached so the re-apply guard can recreate missing
  // elements with the right size/color and know when we're disabled.

  let currentSettings = DEFAULTS;

  function apply(settings) {
    currentSettings = settings;
    if (!settings.enabled) {
      removeStyle();
      removeHalo();
      return;
    }
    ensureStyle(settings);
    ensureHalo(settings);
  }

  // Cheap reconciliation: only touches the DOM when an element is actually
  // missing, so it's safe to call on every mutation batch. Stays a no-op when
  // disabled, so enabled:false is never resurrected.
  function reconcile() {
    if (!currentSettings || !currentSettings.enabled) return;
    if (!document.getElementById(STYLE_ID)) ensureStyle(currentSettings);
    if (!document.getElementById(HALO_ID)) ensureHalo(currentSettings);
  }

  // --- Mouse tracking (install exactly once) --------------------------------

  function installTracking() {
    if (window.__BIGCURSOR_TRACKING__) return;
    window.__BIGCURSOR_TRACKING__ = true;

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let visible = true;

    // Last values written to the DOM; null forces a (re)paint next frame.
    let renderedX = null;
    let renderedY = null;
    let renderedVisible = null;
    let lastHalo = null;

    // mousemove only records the latest position + that the cursor is on-page.
    // No DOM work here — everything is written in the rAF loop below.
    document.addEventListener(
      "mousemove",
      function (e) {
        mouseX = e.clientX;
        mouseY = e.clientY;
        visible = true;
      },
      { passive: true }
    );

    // relatedTarget === null means the pointer left the window entirely — flag
    // the halo to hide so it isn't stranded in a corner. (Write happens in rAF.)
    document.addEventListener(
      "mouseout",
      function (e) {
        if (!e.relatedTarget) visible = false;
      },
      { passive: true }
    );

    // The single rAF loop is the ONLY place that writes to the DOM. It skips any
    // frame where nothing changed, so an idle page costs next to nothing.
    function frame() {
      const halo = document.getElementById(HALO_ID);
      if (halo) {
        // A fresh node (recreated by the re-apply guard) must be repainted.
        if (halo !== lastHalo) {
          lastHalo = halo;
          renderedX = renderedY = null;
          renderedVisible = null;
        }
        if (visible !== renderedVisible) {
          halo.style.display = visible ? "" : "none";
          renderedVisible = visible;
        }
        if (visible && (mouseX !== renderedX || mouseY !== renderedY)) {
          halo.style.transform =
            "translate(-50%, -50%) translate(" +
            mouseX +
            "px, " +
            mouseY +
            "px)";
          renderedX = mouseX;
          renderedY = mouseY;
        }
      } else {
        lastHalo = null;
      }
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  // --- Re-apply guard (install exactly once) --------------------------------
  // SPAs swap large DOM subtrees and can drop our style/halo. A MutationObserver
  // on the documentElement subtree notices and recreates only what's missing.
  // It watches childList only (not attributes), so the per-frame transform
  // writes never wake it, and on a fully idle page it never fires at all.
  function installReapplyGuard() {
    if (window.__BIGCURSOR_GUARD__) return;
    window.__BIGCURSOR_GUARD__ = true;

    const observer = new MutationObserver(reconcile);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  // --- Live updates from the popup ------------------------------------------
  // One message type. Reuse apply() so the live path matches on-load exactly.
  // Guarded so a re-injection never stacks duplicate listeners.
  if (!window.__BIGCURSOR_MSG__) {
    window.__BIGCURSOR_MSG__ = true;
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === "BIGCURSOR_APPLY") apply(msg.settings);
    });
  }

  // --- Init -----------------------------------------------------------------

  async function init() {
    const settings = await getSettings();
    apply(settings);
    installTracking();
    installReapplyGuard();
  }

  init();
})();
