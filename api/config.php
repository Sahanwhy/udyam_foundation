<?php
/**
 * Gallery API Configuration
 * ─────────────────────────
 * Keep this file secure — it contains the JWT secret used to verify admin tokens.
 * The .htaccess in this directory blocks direct browser access to this file.
 */

// JWT secret — MUST match the JWT_SECRET used by your Render backend.
// If you've set a custom JWT_SECRET env var on Render, update this value to match.
define('JWT_SECRET', 'udyam-admin-secret-change-in-production');

// Path to the images directory (relative to this file → up one level → images/)
define('IMAGES_DIR', realpath(__DIR__ . '/../images') ?: dirname(__DIR__) . '/images');

// Path to the gallery metadata JSON file (stored alongside this PHP file)
define('DATA_FILE', __DIR__ . '/gallery-data.json');

// Max upload size per file (20 MB)
define('MAX_FILE_SIZE', 20 * 1024 * 1024);

// Allowed image extensions
define('ALLOWED_EXTENSIONS', ['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif']);

// CORS allowed origins (for local development — production is same-origin)
define('CORS_ORIGINS', [
    'http://localhost',
    'http://127.0.0.1',
    'http://localhost:5500',
    'http://localhost:3000',
    'https://sahanwhy.github.io',
    'https://udyamsdf.org',
    'https://www.udyamsdf.org',
]);
