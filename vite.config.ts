import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Mermaid is large (about 1.5 MB for its ELK chunk). This is expected for a local tool.
  build: { chunkSizeWarningLimit: 4000 },
  test: {
    environment: 'jsdom',
  },
});
