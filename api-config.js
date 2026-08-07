// ═══════════════════════════════════════════════════
//  Udyam Foundation — Central API Configuration
//  Change RENDER_URL below after deploying to Render
// ═══════════════════════════════════════════════════

const RENDER_URL = 'https://udyam-foundation.onrender.com';

// Automatically use localhost when running locally (XAMPP / Live Server)
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3000'
  : RENDER_URL;

// Gallery API — PHP endpoint on GoDaddy (same server as images/)
// On localhost (XAMPP): uses XAMPP's Apache to serve PHP
// On production (GoDaddy): relative path (same-origin)
const GALLERY_API = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? '/Udyam Foundation/api/gallery.php'
  : '/api/gallery.php';
