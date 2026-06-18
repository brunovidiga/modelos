import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        v2: resolve(__dirname, 'v2/index.html'),
        v3: resolve(__dirname, 'v3/index.html'),
        v4: resolve(__dirname, 'v4/index.html')
      }
    }
  }
});
