// SiteNotes storage helpers (Step 2).
//
// The ONLY storage interface in the project. Loaded in both content scripts
// (before content.js) and the popup (before popup.js), so these three
// top-level functions are in scope wherever notes are read or written.
// No raw chrome.storage.* calls should exist anywhere else.
//
// Note shape:
//   { id: string, text: string, color: string, x: number, y: number, collapsed: boolean }
//   - id is generated with crypto.randomUUID() when a note is created (later steps).
//
// Storage rules: chrome.storage.local only. Values are JSON.stringify(notesArray)
// on write and JSON.parse on read. Default to [] everywhere a value is absent or
// unreadable.

// keyForUrl(url) -> "notes:<origin><pathname><search>" with the hash dropped.
// Returns null for anything that isn't an http(s) page (chrome://, about:, etc.).
function keyForUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return "notes:" + u.origin + u.pathname + u.search;
  } catch (e) {
    return null;
  }
}

// getNotes(url) -> Promise<Array>. Always resolves to an array; [] when the URL
// is unsupported, the key is absent, or the stored value fails to parse.
async function getNotes(url) {
  const key = keyForUrl(url);
  if (!key) return [];
  try {
    const result = await chrome.storage.local.get(key);
    const raw = result[key];
    if (raw == null) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

// saveNotes(url, notes) -> Promise<void>. JSON-serialises the array under the
// URL's key. No-op for unsupported URLs.
async function saveNotes(url, notes) {
  const key = keyForUrl(url);
  if (!key) return;
  await chrome.storage.local.set({ [key]: JSON.stringify(notes) });
}
