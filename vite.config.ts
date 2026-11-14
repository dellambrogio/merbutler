import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
  dependencies: Record<string, string>;
};

export default defineConfig({
  plugins: [react()],
  // Shown in the About dialog (src/about/About.tsx).
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __MERMAID_VERSION__: JSON.stringify(pkg.dependencies.mermaid),
  },
  // Mermaid is large (about 1.5 MB for its ELK chunk). This is expected for a local tool.
  build: { chunkSizeWarningLimit: 4000 },
  test: {
    environment: 'jsdom',
    // Agent worktrees live under .claude/; their copies of the tests are not this checkout's.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
  },
});
