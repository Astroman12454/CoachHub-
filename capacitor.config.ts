import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // appId and server.url are deliberately left as-is (com.coachhub.app,
  // coach-hub-g99u.onrender.com) — those are live infrastructure
  // identifiers (Render deployment, iOS/Android bundle id), not display
  // text. Changing them is a real infra/app-store migration, not a
  // find-and-replace; do that as its own deliberate step, coordinated with
  // whatever the new domain/bundle id ends up being.
  appId: 'com.coachhub.app',
  appName: 'Backboard',
  webDir: 'dist/public',
  backgroundColor: '#CC3600',

  // The native app loads the live site directly — same origin, so the
  // existing session-cookie auth just works with no CORS changes —
  // instead of bundling a static copy of dist/public that would have
  // nothing to talk to. Leave `cleartext` false; only http(s):// with TLS.
  server: {
    url: 'https://coach-hub-g99u.onrender.com',
    cleartext: false,
  },

  android: {
    path: 'android',
  },
  ios: {
    path: 'ios',
  },
};

export default config;
