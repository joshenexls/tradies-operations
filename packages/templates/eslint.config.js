import base from '@tradies/config/eslint'

const PURITY = 'renderSite must stay pure and deterministic'

export default [
  ...base,
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            'node:fs',
            'node:http',
            'node:https',
            'node:child_process',
            'fs',
            'http',
            'https',
            'child_process',
            'undici',
          ].map((name) => ({ name, message: `${PURITY} — no I/O in @tradies/templates` })),
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: `${PURITY} — no network access` },
        { name: 'process', message: `${PURITY} — no environment access` },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message: `${PURITY} — no randomness`,
        },
        {
          selector: "NewExpression[callee.name='Date']",
          message: `${PURITY} — no clock access`,
        },
      ],
    },
  },
]
