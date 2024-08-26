import { defineConfig } from 'vite';
import dts from "vite-plugin-dts";

export default defineConfig({
  publicDir: false,
  plugins: [
    dts({ insertTypesEntry: true }),
  ],
  build: {
    minify: 'terser',
    lib: {
      entry: './src/index.ts',
      name: 'App',
      fileName: 'app',
      formats: ['es', 'umd', 'iife']
    },
  },
});