import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.ponte.officina',
  appName: 'Ponte',
  webDir: 'dist',
  backgroundColor: '#EDEDEB',
  plugins: {
    SplashScreen: {
      launchShowDuration: 500,
      launchAutoHide: true,
      launchFadeOutDuration: 250,
      backgroundColor: '#FF6A13',
      showSpinner: false,
    },
    // la pagina si accorcia quando compare la tastiera: fogli e campi restano sopra di lei
    Keyboard: { resize: 'native', resizeOnFullScreen: true },
  },
  ios: { contentInset: 'never' },
  android: { allowMixedContent: false },
};

export default config;
