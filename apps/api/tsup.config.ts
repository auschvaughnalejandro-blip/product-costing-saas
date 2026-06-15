import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  clean: true,
  dts: false,
  // The shared workspace package is published as TypeScript source, so it must
  // be bundled into the output rather than left as an external import.
  noExternal: ['@costing/shared'],
  // PGlite is a dev/demo-only database, loaded via dynamic import; never bundle it.
  external: ['@electric-sql/pglite'],
});
