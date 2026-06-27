// FatScrollbar — popup.js

let currentHostname = "";
let currentScope = "site"; // "site" or "global"

const sizeSlider     = document.getElementById("size-slider");
const sizeVal        = document.getElementById("size-val");
const contrastToggle = document.getElementById("contrast-toggle");
const hostnameEl     = document.getElementById("hostname");
const previewThumb   = document.getElementById("preview-thumb");
const resetBtn       = document.getElementById("reset-btn");
const resetBtnLabel  = document.getElementById("reset-btn-label");
const tabSite        = document.getElementById("tab-site");
const tabGlobal      = document.getElementById("tab-global");

// ── Helpers ────────────────────────────────────────────────────────────────

function getStorageKey() {
  if (currentScope === "global") return "__global__";
  return currentHostname || "__fallback__";
}

/** Drive the purple left-fill on the range input via an inline CSS variable */
function updateSliderFill(value) {
  const pct = ((value - 8) / (48 - 8)) * 100;
  sizeSlider.style.background =
    `linear-gradient(to right, #7c3aed ${pct}%, #2d3561 ${pct}%)`;
}

function updatePreview(size, contrast) {
  const pct = ((size - 8) / (48 - 8)) * 100;
  previewThumb.style.width = Math.max(15, pct) + "%";
  if (contrast === "high") {
    previewThumb.style.background = "#222";
  } else {
    previewThumb.style.background = "#6b7280";
  }
}

// ── Load / Save ────────────────────────────────────────────────────────────

function loadSettings() {
  const key = getStorageKey();
  chrome.storage.sync.get([key], (data) => {
    const s = data[key] || { size: 20, contrast: "normal" };
    sizeSlider.value = s.size;
    sizeVal.textContent = s.size;
    contrastToggle.checked = (s.contrast === "high");
    updateSliderFill(s.size);
    updatePreview(s.size, s.contrast);
  });
}

function saveSettings() {
  const key = getStorageKey();
  const size = parseInt(sizeSlider.value, 10);
  const contrast = contrastToggle.checked ? "high" : "normal";
  chrome.storage.sync.set({ [key]: { size, contrast } });
  updateSliderFill(size);
  updatePreview(size, contrast);
}

// ── Initialise ─────────────────────────────────────────────────────────────

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs && tabs[0] && tabs[0].url) {
    try {
      currentHostname = new URL(tabs[0].url).hostname || "this-page";
    } catch (_) {
      currentHostname = "this-page";
    }
  } else {
    currentHostname = "this-page";
  }
  hostnameEl.textContent = currentHostname;
  loadSettings();
});

// ── Scope Tabs ─────────────────────────────────────────────────────────────

tabSite.addEventListener("click", () => {
  currentScope = "site";
  tabSite.classList.add("active");
  tabGlobal.classList.remove("active");
  resetBtnLabel.textContent = "Reset this site to default";
  loadSettings();
});

tabGlobal.addEventListener("click", () => {
  currentScope = "global";
  tabGlobal.classList.add("active");
  tabSite.classList.remove("active");
  resetBtnLabel.textContent = "Reset all sites to default";
  loadSettings();
});

// ── Live Slider ────────────────────────────────────────────────────────────

sizeSlider.addEventListener("input", () => {
  sizeVal.textContent = sizeSlider.value;
  saveSettings();
});

// ── Contrast Toggle ────────────────────────────────────────────────────────

contrastToggle.addEventListener("change", saveSettings);

// ── Reset Button ───────────────────────────────────────────────────────────

resetBtn.addEventListener("click", () => {
  const key = getStorageKey();
  const defaults = { size: 20, contrast: "normal" };
  // Write defaults so content.js reacts immediately via onChanged
  chrome.storage.sync.set({ [key]: defaults }, () => {
    sizeSlider.value = defaults.size;
    sizeVal.textContent = defaults.size;
    contrastToggle.checked = false;
    updateSliderFill(defaults.size);
    updatePreview(defaults.size, defaults.contrast);
  });
});