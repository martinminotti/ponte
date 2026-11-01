import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'android', 'ios'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
    },
  },
  /*
   * Confini fra i livelli (docs/architettura.md):
   *   domain   → regole pure dell'officina: niente React, archivio, rete, piattaforma
   *   data     → archivio locale, coda, sincronizzazione, cloud
   *   features / ui → schermate: leggono e scrivono solo attraverso repo, hook dell'app e servizi del cloud
   */
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/data/*', '@/app/*', '@/features/*', '@/ui/*', '@/platform/*', '@/voice/*'], message: 'Il dominio resta puro: niente archivio, schermate o piattaforma.' },
            { group: ['react', 'react-dom', 'dexie', 'dexie-react-hooks', '@capacitor/*', '@supabase/*'], message: 'Il dominio resta puro: niente librerie di interfaccia, archivio o rete.' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/**/*.{ts,tsx}', 'src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/data/db', '@/data/changes', '@/data/sync/engine', '@/data/sync/apply', '@/data/cloud/client', '@/data/cloud/transport'],
              message: 'Le schermate passano da repo, dagli hook dell’app (app/hooks) o da cloud/session e cloud/account.',
            },
            { group: ['dexie', '@supabase/*'], message: 'Le schermate non parlano direttamente con archivio o server.' },
          ],
        },
      ],
    },
  },
);
