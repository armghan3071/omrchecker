import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'app.mjs'),
      name: 'OMRChecker',
      fileName: 'omr-checker'
    }
  }
});