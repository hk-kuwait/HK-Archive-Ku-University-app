import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// GitHub Pages needs the repository path; hosted deployments serve from the root.
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? '/digital-archive/' : '/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react', 'pdfjs-dist'],
    include: ['mammoth', 'xlsx'],
  },
}); 
