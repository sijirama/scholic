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

## Releasing to the Chrome Web Store

### Step 0 — Bump the version

Before building, update the version in **both** files (they must match):

| File | Field |
|------|-------|
| `manifest.json` | `"version"` |
| `package.json` | `"version"` |

Chrome Web Store requires the version to be strictly increasing. You cannot re-upload the same version. Use `MAJOR.MINOR.PATCH` (e.g. `0.0.1` → `0.0.2` → `0.1.0`).

### Step 1 — Run the release script

```bash
cd extension
./release.sh
```

This will:
1. Build with production URLs baked in (`https://api.scholic.com/api`, `https://scholic.com`)
2. Verify `api.scholic.com` is present in the output (fails loudly if env vars were missing)
3. Zip only the files needed at runtime — no source, no node_modules
4. Output `scholic-extension-vX.Y.Z.zip` named after the version in `package.json`

### Step 2 — Upload to the Chrome Web Store

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Select the Scholic listing
3. Click **Package** → **Upload new package**
4. Upload the zip produced in step 1
5. Submit for review

**If the reviewer asks for source code** (common for minified bundles), upload a separate zip of just the `src/` folder and `build.mjs` — do not include `node_modules`.

**Reviewer notes:**
- `<all_urls>` host permission is needed because the extension injects a content script on every page so users can annotate any website
- The extension communicates only with `api.scholic.com`

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
