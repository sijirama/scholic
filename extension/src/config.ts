/**
 * Scholia Extension Configuration
 * 
 * Values are injected at build time via esbuild's 'define' feature.
 */
export const CONFIG = {
  // The backend API endpoint
  API_BASE: process.env.API_BASE || 'http://localhost:8081/api',
  
  // The frontend web application URL (for profile links and login)
  WEB_URL: process.env.WEB_URL || 'http://localhost:5173',
};
