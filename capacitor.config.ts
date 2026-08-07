import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.coachhub.app',
  appName: 'Coach Hub',
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
