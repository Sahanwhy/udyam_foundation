// ═══════════════════════════════════════════════════
//  Udyam Foundation — Central API Configuration
//  Change RENDER_URL below after deploying to Render
// ═══════════════════════════════════════════════════

const RENDER_URL = 'https://udyam-foundation-backend.onrender.com';

// Automatically use localhost when running locally (XAMPP / Live Server)
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3000'
  : RENDER_URL;
