// Shared flat ESLint base config. Packages extend via:
//   import base from '@tradies/config/eslint'
//   export default [...base, /* package-specific rules */]
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', '.next/**', '.turbo/**', 'node_modules/**', '.open-next/**'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    },
  },
)
