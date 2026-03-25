/**
 * build.mjs — esbuild config for the Scholic browser extension.
 *
 * Bundles the content script and background script separately.
 * The content script runs in the context of web pages.
 * The background script runs as a service worker in Manifest V3.
 *
 * Usage:
 *   node build.mjs          # one-shot build
 *   node build.mjs --watch  # rebuild on file changes
 */
import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

/** Shared esbuild options for all entry points */
const commonOptions = {
  bundle: true,
  sourcemap: true,
  target: 'chrome120',
  format: 'iife',
  logLevel: 'info',
  define: {
    'process.env.API_BASE': JSON.stringify(process.env.API_BASE || 'http://localhost:8081/api'),
    'process.env.WEB_URL': JSON.stringify(process.env.WEB_URL || 'http://localhost:5173'),
  },
};

/**
 * Content script — injected into every web page.
 * Handles text selection, highlighting, popover, and sidebar.
 */
const contentScript = {
  ...commonOptions,
  entryPoints: ['src/content.ts'],
  outfile: 'content.js',
};

/**
 * Background script — runs as a Manifest V3 service worker.
 * Proxies API calls between the content script and the backend.
 */
const backgroundScript = {
  ...commonOptions,
  entryPoints: ['src/background.ts'],
  outfile: 'background.js',
};

/**
 * PDF Viewer — custom page for annotating PDFs.
 */
const viewerScript = {
  ...commonOptions,
  entryPoints: ['src/viewer.ts'],
  outfile: 'viewer.js',
};

if (isWatch) {
  // Watch mode: rebuild on file changes
  const ctxContent = await esbuild.context(contentScript);
  const ctxBackground = await esbuild.context(backgroundScript);
  const ctxViewer = await esbuild.context(viewerScript);
  await ctxContent.watch();
  await ctxBackground.watch();
  await ctxViewer.watch();

  // Also watch for CSS changes and copy assets to root
  const fs = await import('fs');
  const copyAssets = () => {
    try {
      fs.copyFileSync('src/content.css', 'content.css');
      fs.copyFileSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'pdf.worker.min.mjs');
      fs.copyFileSync('node_modules/pdfjs-dist/web/pdf_viewer.css', 'pdf_viewer.css');
      console.log('⚡ Assets updated');
    } catch (err) {
      console.error('❌ Failed to copy assets:', err);
    }
  };

  // Initial copy
  copyAssets();

  // Simple watch logic for CSS
  fs.watch('src/content.css', (eventType) => {
    if (eventType === 'change') {
      copyAssets();
    }
  });

  console.log('👀 Watching for changes (TS + CSS)...');
} else {
  // One-shot build
  await esbuild.build(contentScript);
  await esbuild.build(backgroundScript);
  await esbuild.build(viewerScript);

  // Copy content.css and pdf worker to root
  const fs = await import('fs');
  fs.copyFileSync('src/content.css', 'content.css');
  fs.copyFileSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'pdf.worker.min.mjs');
  fs.copyFileSync('node_modules/pdfjs-dist/web/pdf_viewer.css', 'pdf_viewer.css');

  console.log('✅ Build complete.');
}
