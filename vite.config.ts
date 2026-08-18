import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// `base` matches the GitHub Pages project path; override with BASE=/ for local
// static previews served from the filesystem root.
export default defineConfig({
  base: process.env.BASE ?? '/particle-ocean/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
