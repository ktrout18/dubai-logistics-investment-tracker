import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` keeps every asset URL relative so the built site works under any
// GitHub Pages sub-path. The UI uses hash routing for the same reason.
export default defineConfig({
  base: './',
  plugins: [react()],
});
