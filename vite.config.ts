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
  build: {
    rollupOptions: {
      output: {
        // `/*!` marks this a legal comment, so the minifier keeps it and the
        // attribution survives into whatever bundle this ends up inside.
        banner:
          '/*! particle-ocean · https://github.com/ekazanec/particle-ocean\n'
          + ' * Copyright (c) 2026 Andrey Gurov · https://agurov.com · MIT */',
      },
    },
  },
});
