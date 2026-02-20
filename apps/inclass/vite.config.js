import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'www',
  build: {
    outDir: '../www-build',
    emptyOutDir: true,
    rollupOptions: {
      input: [
        resolve(__dirname, 'www/index.html'),
        resolve(__dirname, 'www/auth/callback.html'),
        resolve(__dirname, 'www/admin-join.html')
      ],
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  },
  server: {
    port: 3000
  }
});
