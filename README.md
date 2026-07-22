GitHub secrets to add:

- `EXT_API_BASE`: `https://api.scholic.com/api`
- `EXT_WEB_URL`: `https://scholic.com`
- `CHROME_EXTENSION_ID`: from the Chrome Web Store dashboard
- `CHROME_CLIENT_ID`: from Google Cloud Console
- `CHROME_CLIENT_SECRET`: from Google Cloud Console
- `CHROME_REFRESH_TOKEN`: from the OAuth flow

Coolify frontend env var:

- `VITE_API_URL`: `https://api.scholic.com/api`

The extension uses esbuild `define`, and the frontend uses `VITE_API_URL`, so these env vars avoid hardcoded production URLs.
