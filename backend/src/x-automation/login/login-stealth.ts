/**
 * Init script injected before any X.com page-script runs. Hides the most
 * common navigator-level signals automation tooling leaks. Runs in every
 * frame via context.addInitScript().
 *
 * We layer this on top of Patchright's built-in stealth — Patchright handles
 * the deeper plumbing (Runtime.Enable detection, CDP fingerprint), but the
 * surface checks below are easy for X's client-side anti-bot to query and
 * cheap for us to spoof.
 */
export const LOGIN_INIT_SCRIPT = `
(() => {
  try {
    // navigator.webdriver: the canonical automation flag.
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => undefined });

    // Pretend a few common plugins are installed (real Chromium ships with
    // PDF Viewer + Chrome PDF Plugin even in headless).
    Object.defineProperty(Navigator.prototype, 'plugins', {
      get: () => {
        const plugins = [
          { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        ];
        plugins.item = (i) => plugins[i] ?? null;
        plugins.namedItem = (n) => plugins.find((p) => p.name === n) ?? null;
        plugins.refresh = () => undefined;
        Object.defineProperty(plugins, 'length', { value: plugins.length });
        return plugins;
      },
    });

    Object.defineProperty(Navigator.prototype, 'languages', {
      get: () => ['tr-TR', 'tr', 'en-US', 'en'],
    });

    // chrome.runtime — present in real Chrome, missing in headless until set.
    if (!('chrome' in window)) {
      Object.defineProperty(window, 'chrome', {
        value: { runtime: {}, app: {}, csi: () => undefined, loadTimes: () => undefined },
      });
    }

    // permissions.query("notifications") returns "denied" in real browsers
    // but "prompt" in headless — flagged by some bot detectors.
    const originalQuery = window.navigator.permissions?.query?.bind(window.navigator.permissions);
    if (originalQuery) {
      window.navigator.permissions.query = (params) =>
        params && params.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission, onchange: null })
          : originalQuery(params);
    }
  } catch {
    // If any override blows up the page should still load — silently swallow
    // since the worst case is the same as not running this script at all.
  }
})();
`;
