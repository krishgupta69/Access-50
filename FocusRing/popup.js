// FocusRing — popup script
// Reads current settings from storage, renders the controls, and saves on
// change. The popup is recreated every time it opens, so it always loads fresh
// from storage and never assumes prior state.
//
// Live-applying changes to the active tab is the NEXT step. For now, saving +
// reloading the page is enough to see changes. An in-popup preview button shows
// the ring immediately via a <style id="focusring-preview"> we keep in sync.

// Same key + DEFAULTS + merge as content.js (separate context, so redeclared).
const DEFAULTS = {
  enabled: true,
  color: "#facc15",
  thickness: 4,
  offset: 2,
  style: "solid",
  glow: true,
};

const STORAGE_KEY = "focusring_settings";
const PREVIEW_STYLE_ID = "focusring-preview";

async function getSettings() {
  const o = await chrome.storage.sync.get(STORAGE_KEY);
  return { ...DEFAULTS, ...(o[STORAGE_KEY] || {}) };
}

async function saveSettings(s) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: s });
}

// Identical rule to content.js so the in-popup preview matches the page exactly.
function buildCSS(settings) {
  const { color, thickness, offset, style, glow } = settings;

  const shadow = glow
    ? `0 0 0 ${thickness + 2}px ${color}55, 0 0 ${thickness * 2}px ${color}88`
    : "none";

  return `:focus-visible, :focus {
  outline: ${thickness}px ${style} ${color} !important;
  outline-offset: ${offset}px !important;
  box-shadow: ${shadow} !important;
  border-radius: 2px;
}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const enabledEl = document.getElementById("enabled");
  const colorEl = document.getElementById("color");
  const thicknessEl = document.getElementById("thickness");
  const offsetEl = document.getElementById("offset");
  const styleEl = document.getElementById("style");
  const glowEl = document.getElementById("glow");

  const thicknessValEl = document.getElementById("thickness-val");
  const offsetValEl = document.getElementById("offset-val");

  // Keep the in-popup preview style in sync with the current settings.
  function updatePreview(settings) {
    let el = document.getElementById(PREVIEW_STYLE_ID);
    if (!el) {
      el = document.createElement("style");
      el.id = PREVIEW_STYLE_ID;
      document.head.appendChild(el);
    }
    // When disabled there is no ring — mirror the page behaviour.
    el.textContent = settings.enabled ? buildCSS(settings) : "";
  }

  // Push a settings object into the controls.
  function setControls(s) {
    enabledEl.checked = s.enabled;
    colorEl.value = s.color;
    thicknessEl.value = s.thickness;
    offsetEl.value = s.offset;
    styleEl.value = s.style;
    glowEl.checked = s.glow;
    thicknessValEl.textContent = `${s.thickness}px`;
    offsetValEl.textContent = `${s.offset}px`;
  }

  // Read the controls back into a settings object.
  function readControls() {
    return {
      enabled: enabledEl.checked,
      color: colorEl.value,
      thickness: Number(thicknessEl.value),
      offset: Number(offsetEl.value),
      style: styleEl.value,
      glow: glowEl.checked,
    };
  }

  // Tell the active tab's content script to re-apply instantly (no reload).
  async function applyToActiveTab(settings) {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab && tab.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: "FOCUSRING_APPLY",
          settings,
        });
      } catch (e) {
        // No content script here (chrome:// pages, web store) — ignore.
      }
    }
  }

  async function onChange() {
    const s = readControls();
    thicknessValEl.textContent = `${s.thickness}px`;
    offsetValEl.textContent = `${s.offset}px`;
    await saveSettings(s);
    updatePreview(s);
    await applyToActiveTab(s);
  }

  // Load fresh from storage and render.
  const settings = await getSettings();
  setControls(settings);
  updatePreview(settings);

  // Save + refresh the preview on any change ("input" gives live slider updates).
  [enabledEl, colorEl, thicknessEl, offsetEl, styleEl, glowEl].forEach((el) =>
    el.addEventListener("input", onChange)
  );
});
