#!/usr/bin/env bun

import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const version = pkg.version;

await Bun.build({
  entrypoints: ['./src/cli.ts'],
  outdir: './dist',
  target: 'node',
  minify: true,
  define: {
    __VERSION__: JSON.stringify(version),
  },
});

console.log(`Built wasp v${version}`);
