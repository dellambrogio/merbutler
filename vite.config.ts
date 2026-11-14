import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Mermaid is large (about 1.5 MB for its ELK chunk). This is expected for a local tool.
  build: { chunkSizeWarningLimit: 4000 },
  test: {
    environment: 'jsdom',
    // Agent worktrees live under .claude/; their copies of the tests are not this checkout's.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
  },
});
