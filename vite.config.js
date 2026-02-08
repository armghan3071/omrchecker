import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'app.js'),
      name: 'OMRChecker',
      fileName: 'omr-checker'
    }
  }
});