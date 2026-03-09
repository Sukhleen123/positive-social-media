import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const target = process.env.BUILD_TARGET;

export default defineConfig(() => {
  if (target === 'background') {
    return {
      build: {
        lib: {
          entry: path.resolve(__dirname, 'src/background/index.ts'),
          name: 'PSMBackground',
          fileName: 'background',
          formats: ['es'],
        },
        rollupOptions: {
          output: {
            entryFileNames: 'background.js',
          },
        },
        outDir: 'dist',
        emptyOutDir: false,
        minify: false,
        sourcemap: false,
      },
    };
  }

  if (target === 'content') {
    return {
      build: {
        lib: {
          entry: path.resolve(__dirname, 'src/content/index.ts'),
          name: 'PSMContent',
          fileName: 'content',
          formats: ['iife'],
        },
        rollupOptions: {
          output: {
            entryFileNames: 'content.js',
            inlineDynamicImports: true,
          },
        },
        outDir: 'dist',
        emptyOutDir: false,
        minify: false,
        sourcemap: false,
      },
    };
  }

  if (target === 'popup') {
    return {
      plugins: [react()],
      root: path.resolve(__dirname, 'src/popup'),
      base: './',
      build: {
        rollupOptions: {
          input: path.resolve(__dirname, 'src/popup/index.html'),
        },
        outDir: path.resolve(__dirname, 'dist/popup'),
        emptyOutDir: true,
        minify: false,
        sourcemap: false,
      },
    };
  }

  // Default: serve popup for development
  return {
    plugins: [react()],
    root: path.resolve(__dirname, 'src/popup'),
    base: './',
    build: {
      outDir: path.resolve(__dirname, 'dist/popup'),
      emptyOutDir: true,
    },
  };
});
