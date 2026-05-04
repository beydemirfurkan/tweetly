/**
 * Init script injected before any X.com page-script runs via
 * context.addInitScript(). Layered on top of Patchright's built-in stealth.
 *
 * Covers navigator-level, WebGL, and environment signals that X's client-side
 * anti-bot queries. Cheap to spoof and highly discriminative when absent.
 */
export const LOGIN_INIT_SCRIPT = `
(() => {
  try {
    // --- navigator.webdriver ---
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => undefined });

    // --- navigator.plugins (real Chromium ships PDF plugins even in headless) ---
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

    // --- navigator.languages ---
    Object.defineProperty(Navigator.prototype, 'languages', {
      get: () => ['tr-TR', 'tr', 'en-US', 'en'],
    });

    // --- navigator.hardwareConcurrency (headless often reports 2) ---
    const origHC = Object.getOwnPropertyDescriptor(Navigator.prototype, 'hardwareConcurrency');
    if (origHC) {
      Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', {
        get: () => 8,
        configurable: true,
      });
    }

    // --- navigator.deviceMemory (headless often reports 2 or undefined) ---
    if ('deviceMemory' in Navigator.prototype) {
      Object.defineProperty(Navigator.prototype, 'deviceMemory', {
        get: () => 8,
        configurable: true,
      });
    }

    // --- window.chrome (present in real Chrome, missing in headless) ---
    if (!('chrome' in window)) {
      Object.defineProperty(window, 'chrome', {
        value: { runtime: {}, app: {}, csi: () => undefined, loadTimes: () => undefined },
      });
    }

    // --- permissions.query("notifications") returns "denied" in real browsers ---
    const originalQuery = window.navigator.permissions?.query?.bind(window.navigator.permissions);
    if (originalQuery) {
      window.navigator.permissions.query = (params) =>
        params && params.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission, onchange: null })
          : originalQuery(params);
    }

    // --- navigator.connection (real browsers expose this) ---
    if (!('connection' in navigator)) {
      Object.defineProperty(navigator, 'connection', {
        value: {
          effectiveType: '4g',
          rtt: 50,
          downlink: 10,
          saveData: false,
          onchange: null,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        },
        configurable: true,
      });
    }

    // --- outerWidth / outerHeight (differ from inner in real browsers) ---
    // headless sets outer === inner, which is a signal.
    try {
      Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth + 16, configurable: true });
      Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight + 88, configurable: true });
    } catch {}

    // --- WebGL vendor/renderer override (headless reports SwiftShader) ---
    try {
      const getParameterProxy = (origFn) => function(param) {
        if (param === 0x1F00) return 'Google Inc. (NVIDIA)';
        if (param === 0x1F01) return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)';
        return origFn.call(this, param);
      };
      const origGetParam = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = getParameterProxy(origGetParam);
      const origGetParam2 = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = getParameterProxy(origGetParam2);
    } catch {}

    // --- navigator.platform consistency (headless sometimes reports Linux) ---
    try {
      Object.defineProperty(Navigator.prototype, 'platform', {
        get: () => 'Win32',
        configurable: true,
      });
    } catch {}

    // --- navigator.maxTouchPoints (desktop = 0, consistent) ---
    try {
      Object.defineProperty(Navigator.prototype, 'maxTouchPoints', {
        get: () => 0,
        configurable: true,
      });
    } catch {}
  } catch {
    // If any override blows up the page should still load.
  }
})();
`;
