import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'sm.registroofficina.app',
  appName: 'Registro Officina',
  webDir: 'dist',
  backgroundColor: '#F2F3F1',
  plugins: {
    SplashScreen: { launchShowDuration: 0, backgroundColor: '#F2F3F1' },
  },
  ios: { contentInset: 'never' },
  android: { allowMixedContent: false },
};

export default config;
