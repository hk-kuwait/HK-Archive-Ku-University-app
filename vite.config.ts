import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// GitHub Actions sets GITHUB_ACTIONS; Netlify and Vercel serve the site from the root.
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? '/HK-Archive-Ku-University-app/' : '/', // <-- تم تحديث اسم المستودع هنا
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
