import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.coachhub.app',
  appName: 'Coach Hub',
  webDir: 'dist/public',
  backgroundColor: '#DB3A00',

  // TODO once the backend is deployed (e.g. to Render via render.yaml):
  // uncomment this block and set `url` to that deployment's HTTPS address.
  // This makes the native app load the live site directly — same origin,
  // so the existing session-cookie auth just works with no CORS changes —
  // instead of bundling a static copy of dist/public that would have
  // nothing to talk to. Leave `cleartext` false; only http(s):// with TLS.
  //
  // server: {
  //   url: 'https://your-app.onrender.com',
  //   cleartext: false,
  // },

  android: {
    path: 'android',
  },
  ios: {
    path: 'ios',
  },
};

export default config;
