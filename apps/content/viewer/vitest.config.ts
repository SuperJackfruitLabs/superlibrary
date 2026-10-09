import { defineConfig } from 'vitest/config';
// viz.js's asm.js fails V8's asm.js link step under jsdom's globals and runs as plain JS; Node reports
// that as a 'V8' warning. Only that warning type is silenced.
export default defineConfig({ test: { environment: 'jsdom', include: ['viewer/test/**/*.test.ts'], execArgv: ['--disable-warning=V8'] } });
