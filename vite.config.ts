import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    open: true,
    proxy: {
      '/auth-proxy': {
        target: 'https://login.microsoftonline.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/auth-proxy/, ''),
      },
    },
  },
  resolve: {
    alias: {
      '@adaptive-ui': path.resolve(__dirname, './src/framework'),
    },
  },
});
