export default {
  config: {
    default: true,
    'line-length': false,
    'no-inline-html': false,
    'first-line-h1': false,
  },
  globs: [
    '**/*.md',
    '!node_modules/**',
    '!docs/.vitepress/cache/**',
    '!docs/.vitepress/dist/**',
    '!docs/reference/v1/generated/**',
  ],
};
