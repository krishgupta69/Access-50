// FatScrollbar — content.js
// Runs at document_start on every page
// Reads saved size for this hostname and injects scrollbar CSS

(function () {
  const hostname = location.hostname;

  // Create a style tag we can update later if the user changes the slider
  const styleTag = document.createElement("style");
  styleTag.id = "fatscrollbar-style";
  document.documentElement.appendChild(styleTag);

  function applyScrollbar(size, contrast) {
    const thumbColor = contrast === "high" ? "#222222" : "#888888";
    const trackColor = contrast === "high" ? "#cccccc" : "#f0f0f0";
    const thumbHover  = contrast === "high" ? "#000000" : "#555555";

    styleTag.textContent = `
      /* FatScrollbar injected styles */
      ::-webkit-scrollbar {
        width: ${size}px !important;
        height: ${size}px !important;
      }
      ::-webkit-scrollbar-track {
        background: ${trackColor} !important;
        border-radius: 8px !important;
      }
      ::-webkit-scrollbar-thumb {
        background: ${thumbColor} !important;
        border-radius: 8px !important;
        border: 2px solid ${trackColor} !important;
      }
      ::-webkit-scrollbar-thumb:hover {
        background: ${thumbHover} !important;
      }
      ::-webkit-scrollbar-corner {
        background: ${trackColor} !important;
      }
    `;
  }

  // Load saved settings for this site (fallback to global, then defaults)
  chrome.storage.sync.get([hostname, "__global__"], (data) => {
    const settings = data[hostname] || data["__global__"] || { size: 20, contrast: "normal" };
    applyScrollbar(settings.size, settings.contrast);
  });

  // Listen for live updates from popup (no page reload needed)
  chrome.storage.onChanged.addListener((changes) => {
    const relevant = changes[hostname] || changes["__global__"];
    if (relevant) {
      const settings = relevant.newValue || { size: 20, contrast: "normal" };
      applyScrollbar(settings.size, settings.contrast);
    }
  });
})();