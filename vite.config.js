import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  root: 'client',
  base: './',
  build: {
    outDir: '../public',
    emptyOutDir: true,
    target: 'es2018'
  },
  server: {
    port: 5173,
    host: true
  }
});
