● So the full list of GitHub secrets to add (6 total):

  ┌──────────────────────┬─────────────────────────────┐
  │        Secret        │            Value            │
  ├──────────────────────┼─────────────────────────────┤
  │ EXT_API_BASE         │ https://api.scholic.com/api │
  ├──────────────────────┼─────────────────────────────┤
  │ EXT_WEB_URL          │ https://scholic.com         │
  ├──────────────────────┼─────────────────────────────┤
  │ CHROME_EXTENSION_ID  │ from Web Store dashboard    │
  ├──────────────────────┼─────────────────────────────┤
  │ CHROME_CLIENT_ID     │ from Google Cloud Console   │
  ├──────────────────────┼─────────────────────────────┤
  │ CHROME_CLIENT_SECRET │ from Google Cloud Console   │
  ├──────────────────────┼─────────────────────────────┤
  │ CHROME_REFRESH_TOKEN │ from OAuth flow             │
  └──────────────────────┴─────────────────────────────┘

  And in Coolify for the frontend service, one env var: VITE_API_URL=https://api.scholic.com/api

  That's genuinely everything. The architecture was set up well — the previous work to use esbuild define and VITE_API_URL means there's zero
  hardcoding to change, just secrets to fill in.
