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
});
