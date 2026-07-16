import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.worldofclaudecraft',
  appName: 'World of CodexCraft',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
  },
  ios: {
    contentInset: 'never',
  },
};

export default config;
