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
      '/gflights-proxy': {
        target: 'https://www.google.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/gflights-proxy\/https?:\/\/www\.google\.com/, ''),
      },
    },
  },
  resolve: {
    alias: {
      '@sabbour/adaptive-ui-core/icons': path.resolve(__dirname, '../../packages/core/src/icons'),
      '@sabbour/adaptive-ui-core/css': path.resolve(__dirname, '../../packages/core/src/css'),
      '@sabbour/adaptive-ui-core': path.resolve(__dirname, '../../packages/core/src'),
      '@sabbour/adaptive-ui-azure-pack/diagram-icons': path.resolve(__dirname, '../../packages/azure-pack/src/diagram-icons'),
      '@sabbour/adaptive-ui-azure-pack': path.resolve(__dirname, '../../packages/azure-pack/src'),
      '@sabbour/adaptive-ui-github-pack': path.resolve(__dirname, '../../packages/github-pack/src'),
      '@sabbour/adaptive-ui-google-maps-pack/settings': path.resolve(__dirname, '../../packages/google-maps-pack/src/GoogleMapsSettings'),
      '@sabbour/adaptive-ui-google-maps-pack': path.resolve(__dirname, '../../packages/google-maps-pack/src'),
      '@sabbour/adaptive-ui-google-flights-pack': path.resolve(__dirname, '../../packages/google-flights-pack/src'),
      '@sabbour/adaptive-ui-travel-data-pack': path.resolve(__dirname, '../../packages/travel-data-pack/src'),
    },
  },
});
