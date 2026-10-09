import { defineConfig } from 'vite';

/**
 * One self-contained ES module, for products outside this repository that vendor it (plan decision
 * O3). The contract is inlined (it is `sideEffects: false`), nothing is minified, so a reviewer of a
 * vendoring PR can read what changed.
 */
export default defineConfig({
  build: {
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'superlibrary-embed.js' },
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    target: 'es2022',
  },
});
