import nextVitals from 'eslint-config-next/core-web-vitals';

export default [
  ...nextVitals,
  {
    ignores: ['**/.next/**', '**/dist/**', '**/node_modules/**', '**/.turbo/**'],
  },
];
