import { defineManifest } from "@crxjs/vite-plugin";

/**
 * Chrome MV3 manifest for Opportunity Analyzer Agent.
 *
 * Permission principle: keep the smallest set possible. We rely on
 * `activeTab` + `scripting` to inject the content script only on demand,
 * so we avoid broad host permissions. Host permissions for the Gemini
 * endpoint are added explicitly so fetch() in the service worker works.
 */
export default defineManifest({
  manifest_version: 3,
  name: "Opportunity Analyzer Agent",
  version: "0.1.0",
  description:
    "Local-first, rate-limit-aware opportunity analyzer powered by Google Gemini or OpenAI.",
  action: {
    default_title: "Opportunity Analyzer Agent",
  },
  side_panel: {
    default_path: "src/sidepanel/index.html",
  },
  background: {
    service_worker: "src/background/worker.ts",
    type: "module",
  },
  content_scripts: [
    {
      // The content script is declared here so @crxjs bundles it and
      // Chrome knows the correct built-asset path. The script itself is
      // strictly reactive: it only installs a chrome.runtime.onMessage
      // listener and does NO work until the service worker sends a
      // message. No scraping, no polling. This satisfies the spec's
      // "no continuous scraping / no auto-analysis" rules while keeping
      // injection reliable across Chromium versions.
      matches: ["<all_urls>"],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
    },
  ],
  permissions: [
    "activeTab",
    "scripting",
    "storage",
    "sidePanel",
    "contextMenus",
    "tabs",
  ],
  host_permissions: [
    "https://generativelanguage.googleapis.com/*",
    "https://api.openai.com/*",
  ],
  // Icons intentionally omitted; the extension runs without them.
  // Drop square PNGs into /icons and re-add this block to customize.
});
