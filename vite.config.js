import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [svelte(), cloudflare()],
  root: 'client',
  base: './',
  build: {
    outDir: '../public',
    emptyOutDir: true,
    target: 'es2018'
  },
  server: {
    port: 8000,
    host: true
  }
});