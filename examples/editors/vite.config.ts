import { defineConfig } from 'vite';
export default defineConfig({
  esbuild: { target: 'esnext' },
  optimizeDeps: { esbuildOptions: { target: 'esnext', supported: { destructuring: true } } },
  build: { target: 'esnext' },
  server: { fs: { allow: ['../..'] } },
});
