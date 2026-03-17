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
      '/github-oauth/device/code': {
        target: 'https://github.com',
        changeOrigin: true,
        rewrite: () => '/login/device/code',
      },
      '/github-oauth/access_token': {
        target: 'https://github.com',
        changeOrigin: true,
        rewrite: () => '/login/oauth/access_token',
      },
    },
  },
  resolve: {
    alias: {
      '@adaptive-ui': path.resolve(__dirname, './src/framework'),
    },
  },
});
