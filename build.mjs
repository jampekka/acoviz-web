import * as esbuild from 'esbuild';
import { cpSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
await esbuild.build({
  entryPoints: { scene: 'src/sceneRenderer.js', instrument: 'src/instrumentRenderer.js' },
  bundle: true,
  minify: true,
  loader: { '.js': 'jsx' },
  define: { 'process.env.NODE_ENV': '"production"' },
  // One copy of three.js for both require('three') and the examples' imports.
  conditions: ['import'],
  outdir: 'dist',
});
for (const path of ['index.html', 'instrument.html', 'theme-fonts.css', 'assets', 'LICENSES']) {
  cpSync(path, `dist/${path}`, { recursive: true });
}
