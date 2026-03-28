# Scholic Browser Extension

Chrome extension for annotating any web page or PDF. Highlights text, saves annotations to the Scholic backend, and shows a sidebar with all annotations on the current page.

---

## Development

### Prerequisites

- Node.js 18+
- The Scholic backend running locally on `http://localhost:8081`
- The Scholic web client running locally on `http://localhost:5173`

### Install dependencies

```bash
cd extension
npm install
```

### Run in watch mode (local dev)

```bash
node build.mjs --watch
```

This rebuilds `content.js`, `background.js`, and `viewer.js` automatically on every file change. The API will point to `http://localhost:8081/api` and the web client to `http://localhost:5173` by default.

### Load the extension in Chrome

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select this `extension/` directory

After any rebuild, click the refresh icon on the extension card in `chrome://extensions` to pick up the new JS.

---

## Building for Production (Chrome Web Store)

### Step 1 — Build with production URLs baked in

Run this from the `extension/` directory:

```bash
API_BASE=https://api.scholic.com/api WEB_URL=https://scholic.com node build.mjs
```

This bakes the production API URL (`https://api.scholic.com/api`) and web URL (`https://scholic.com`) directly into the compiled JS bundles. Do **not** skip the env vars — without them the build defaults to localhost and the production extension will be broken.

Quick sanity check after building:

```bash
grep -o "api.scholic.com" background.js
```

It should print `api.scholic.com` at least once. If you see nothing, the env vars weren't picked up.

### Step 2 — Create the zip for upload

```bash
zip -r scholic-extension.zip \
  manifest.json \
  background.js \
  content.js \
  viewer.js \
  viewer.html \
  content.css \
  pdf_viewer.css \
  pdf.worker.min.mjs \
  icons/
```

This produces `scholic-extension.zip` in the `extension/` directory. Do **not** include:

- `src/` — TypeScript source (not needed at runtime)
- `node_modules/` — build tooling only
- `*.map` — source maps (large, not required in the zip)
- `build.mjs`, `package.json`, `tsconfig.json` — build scripts only

### Step 3 — Upload to the Chrome Web Store

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Click **New item** (first time) or select the existing listing
3. Upload `scholic-extension.zip`
4. Fill in the store listing (description, screenshots, category)
5. Submit for review

**Reviewer notes to prepare:**
- `<all_urls>` host permission is needed because the extension injects a content script on every page so users can annotate any website
- The extension communicates only with `api.scholic.com`

If the reviewer asks for source code (common for minified bundles), upload a separate zip of just the `src/` folder and `build.mjs` — do not include `node_modules`.

---

## Versioning

The version lives in two places — keep them in sync:

| File | Field |
|------|-------|
| `manifest.json` | `"version"` — this is what Chrome and the Web Store actually display |
| `package.json` | `"version"` — npm convention, should match |

Chrome Web Store requires the version to be strictly increasing with each submission. You cannot re-upload the same version number. Use `MAJOR.MINOR.PATCH` (e.g. `0.0.1` → `0.0.2` → `0.1.0`).

Current version: **0.0.1**

---

## Project structure

```
extension/
├── src/
│   ├── background.ts     # Service worker — handles auth, tab events, PDF redirect
│   ├── content.ts        # Content script — injected into every page
│   ├── sidebar.ts        # Sidebar UI and annotation list
│   ├── popover.ts        # Popover shown on text selection
│   ├── highlight-popup.ts# Click popup on existing highlights
│   ├── viewer.ts         # PDF viewer annotation logic
│   ├── snipper.ts        # Screenshot/image annotation capture
│   └── content.css       # Highlight styles injected into pages
├── icons/                # Extension icons (16, 48, 128px)
├── viewer.html           # Custom PDF viewer page
├── manifest.json         # Extension manifest (MV3)
├── build.mjs             # esbuild config
└── package.json
```

Built files (`background.js`, `content.js`, `viewer.js`, `content.css`, `pdf_viewer.css`, `pdf.worker.min.mjs`) are generated in the root of `extension/` and are gitignored.

---

## Environment variables (build time)

| Variable | Default | Production |
|----------|---------|------------|
| `API_BASE` | `http://localhost:8081/api` | `https://api.scholic.com/api` |
| `WEB_URL` | `http://localhost:5173` | `https://scholic.com` |

These are baked into the JS bundles at build time via esbuild `define`. They are **not** runtime env vars — you must rebuild to change them.
