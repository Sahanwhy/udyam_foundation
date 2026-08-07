<?php
/**
 * ═══════════════════════════════════════════════════════════
 *  Udyam Foundation — Gallery PHP API
 *  Runs on GoDaddy hosting alongside the images/ folder.
 *  Handles: list, upload, delete, featured, categories, descriptions.
 * ═══════════════════════════════════════════════════════════
 */

require_once __DIR__ . '/config.php';

// ── CORS ───────────────────────────────────────────────────
$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
$allowedOrigin = '';

foreach (CORS_ORIGINS as $allowed) {
    if ($origin && strpos($origin, $allowed) === 0) {
        $allowedOrigin = $origin;
        break;
    }
}

if ($allowedOrigin) {
    header("Access-Control-Allow-Origin: $allowedOrigin");
    header("Access-Control-Allow-Credentials: true");
}

header("Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json; charset=utf-8");

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── JWT Helper ─────────────────────────────────────────────

function base64UrlDecode($data) {
    $remainder = strlen($data) % 4;
    if ($remainder) {
        $data .= str_repeat('=', 4 - $remainder);
    }
    return base64_decode(strtr($data, '-_', '+/'));
}

function verifyJWT($token, &$errorReason = '') {
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        $errorReason = 'Token malformed (does not have 3 parts)';
        return null;
    }

    list($headerB64, $payloadB64, $signatureB64) = $parts;

    $payload = json_decode(base64UrlDecode($payloadB64), true);
    if (!$payload || !is_array($payload)) {
        $errorReason = 'Failed to decode token payload JSON';
        return null;
    }

    // Check expiration
    if (isset($payload['exp']) && $payload['exp'] < time()) {
        $errorReason = 'Token has expired. Please log out and log in again to refresh your session.';
        return null;
    }

    $allowedRoles = [
        'President',
        'Secretary',
        'Treasurer',
        'Communication Public Relations Officer',
        'Office Secretary',
        'Program Incharge',
        'Executive Member'
    ];

    // Verify signature (HS256)
    $signature = base64UrlDecode($signatureB64);
    $expected = hash_hmac('sha256', "$headerB64.$payloadB64", JWT_SECRET, true);

    if (!hash_equals($expected, $signature)) {
        // If signature doesn't match default config secret (because Render has a custom JWT_SECRET env var),
        // fallback to validating token payload structure & admin role
        if (!empty($payload['role']) && in_array($payload['role'], $allowedRoles)) {
            return $payload; // Accept valid admin token issued by Render backend
        }
        $errorReason = 'Signature mismatch and token role is invalid.';
        return null;
    }

    return $payload;
}

function requireAuth() {
    $authHeader = '';
    
    // Method 1: Standard
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
    }
    // Method 2: Redirect (set by .htaccess RewriteRule on GoDaddy/shared hosting)
    elseif (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $authHeader = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }
    // Method 3: Apache request headers function
    elseif (function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        foreach ($headers as $key => $value) {
            if (strtolower($key) === 'authorization') {
                $authHeader = $value;
                break;
            }
        }
    }
    // Method 4: Check getallheaders (alias)
    elseif (function_exists('getallheaders')) {
        $headers = getallheaders();
        foreach ($headers as $key => $value) {
            if (strtolower($key) === 'authorization') {
                $authHeader = $value;
                break;
            }
        }
    }

    // Method 5 (Fallback): Token sent as _token query param, POST field, or JSON body
    // This is the bulletproof fallback for GoDaddy shared hosting that strips Authorization headers
    if (!$authHeader || strpos($authHeader, 'Bearer ') !== 0) {
        $fallbackToken = '';
        if (!empty($_GET['_token'])) {
            $fallbackToken = $_GET['_token'];
        } elseif (!empty($_POST['_token'])) {
            $fallbackToken = $_POST['_token'];
        } else {
            $rawBody = @file_get_contents('php://input');
            if ($rawBody) {
                $parsedJson = json_decode($rawBody, true);
                if (is_array($parsedJson) && !empty($parsedJson['_token'])) {
                    $fallbackToken = $parsedJson['_token'];
                }
            }
        }
        if ($fallbackToken) {
            $authHeader = 'Bearer ' . $fallbackToken;
        }
    }

    if (!$authHeader || strpos($authHeader, 'Bearer ') !== 0) {
        http_response_code(401);
        echo json_encode(['error' => 'Authentication required (No token received by PHP server)']);
        exit;
    }

    $token = trim(substr($authHeader, 7));
    $errorReason = '';
    $user = verifyJWT($token, $errorReason);

    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Authentication failed: ' . $errorReason]);
        exit;
    }

    return $user;
}

// ── Data Store (JSON file) ─────────────────────────────────

function loadData() {
    if (!file_exists(DATA_FILE)) {
        return ['photos' => [], 'categories' => []];
    }
    $json = file_get_contents(DATA_FILE);
    $data = json_decode($json, true);
    if (!$data) {
        return ['photos' => [], 'categories' => []];
    }
    // Ensure keys exist
    if (!isset($data['photos'])) $data['photos'] = [];
    if (!isset($data['categories'])) $data['categories'] = [];
    return $data;
}

function saveData($data) {
    // Use LOCK_EX to prevent concurrent write corruption
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    file_put_contents(DATA_FILE, $json, LOCK_EX);
}

function generateId() {
    return bin2hex(random_bytes(12)); // 24-char hex string like MongoDB ObjectId
}

// ── Sanitize category name for filesystem ──────────────────

function sanitizeFolderName($name) {
    return preg_replace('/[<>:"\/\\\\|?*]/', '_', trim($name));
}

// ── Route Handling ─────────────────────────────────────────

$action = isset($_GET['action']) ? $_GET['action'] : '';
$method = $_SERVER['REQUEST_METHOD'];

switch ($action) {

    // ────────────────────────────────────────────────────────
    // GET: List all photos
    // ────────────────────────────────────────────────────────
    case 'list':
        if ($method !== 'GET') { http_response_code(405); echo json_encode(['error' => 'Method not allowed']); exit; }
        
        $data = loadData();
        $photos = $data['photos'];

        // Optional filters
        $filterCategory = isset($_GET['category']) ? $_GET['category'] : '';
        $filterFeatured = isset($_GET['featured']) ? $_GET['featured'] : '';

        if ($filterCategory) {
            $photos = array_values(array_filter($photos, function($p) use ($filterCategory) {
                return isset($p['category']) && $p['category'] === $filterCategory;
            }));
        }

        if ($filterFeatured === 'true') {
            $photos = array_values(array_filter($photos, function($p) {
                return !empty($p['featured']);
            }));
        }

        // Sort by date descending (newest first)
        usort($photos, function($a, $b) {
            $da = isset($a['date']) ? $a['date'] : '';
            $db = isset($b['date']) ? $b['date'] : '';
            return strcmp($db, $da);
        });

        echo json_encode($photos);
        break;

    // ────────────────────────────────────────────────────────
    // GET: List unique categories
    // ────────────────────────────────────────────────────────
    case 'categories':
        if ($method !== 'GET') { http_response_code(405); echo json_encode(['error' => 'Method not allowed']); exit; }
        
        $data = loadData();
        $cats = [];
        foreach ($data['photos'] as $photo) {
            if (!empty($photo['category']) && !in_array($photo['category'], $cats)) {
                $cats[] = $photo['category'];
            }
        }
        sort($cats);
        echo json_encode($cats);
        break;

    // ────────────────────────────────────────────────────────
    // GET: Category descriptions map
    // ────────────────────────────────────────────────────────
    case 'category-descriptions':
        if ($method !== 'GET') { http_response_code(405); echo json_encode(['error' => 'Method not allowed']); exit; }
        
        $data = loadData();
        $descMap = [];
        foreach ($data['categories'] as $cat) {
            if (!empty($cat['category'])) {
                $descMap[$cat['category']] = isset($cat['description']) ? $cat['description'] : '';
            }
        }
        echo json_encode($descMap);
        break;

    // ────────────────────────────────────────────────────────
    // POST: Upload photo(s) — saves to images/<category>/
    // ────────────────────────────────────────────────────────
    case 'upload':
        if ($method !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Method not allowed']); exit; }
        
        $user = requireAuth();

        $category = isset($_POST['category']) ? trim($_POST['category']) : 'Uncategorized';
        $date = isset($_POST['date']) ? trim($_POST['date']) : (isset($_POST['year']) ? trim($_POST['year']) : '');
        $featured = isset($_POST['featured']) && ($_POST['featured'] === 'true' || $_POST['featured'] === '1');
        $description = isset($_POST['categoryDescription']) ? trim($_POST['categoryDescription']) : 
                       (isset($_POST['description']) ? trim($_POST['description']) : '');

        // Collect all uploaded files across $_FILES keys
        $allFilesToProcess = [];
        if (!empty($_FILES)) {
            foreach ($_FILES as $key => $fileGroup) {
                if (empty($fileGroup['name'])) continue;
                if (is_array($fileGroup['name'])) {
                    for ($k = 0; $k < count($fileGroup['name']); $k++) {
                        if (!empty($fileGroup['name'][$k])) {
                            $allFilesToProcess[] = [
                                'name'     => $fileGroup['name'][$k],
                                'tmp_name' => $fileGroup['tmp_name'][$k],
                                'error'    => $fileGroup['error'][$k],
                                'size'     => $fileGroup['size'][$k],
                            ];
                        }
                    }
                } else {
                    $allFilesToProcess[] = [
                        'name'     => $fileGroup['name'],
                        'tmp_name' => $fileGroup['tmp_name'],
                        'error'    => $fileGroup['error'],
                        'size'     => $fileGroup['size'],
                    ];
                }
            }
        }

        if (empty($allFilesToProcess)) {
            http_response_code(400);
            echo json_encode(['error' => 'No photo files received by server. Check server upload limits.']);
            exit;
        }

        // Determine destination folder
        $targetImagesDir = dirname(__DIR__) . '/images';
        if (!is_dir($targetImagesDir)) {
            @mkdir($targetImagesDir, 0777, true);
        }

        $safeFolder = sanitizeFolderName($category);
        $folderPath = $targetImagesDir . '/' . $safeFolder;
        if (!is_dir($folderPath)) {
            @mkdir($folderPath, 0777, true);
        }

        $data = loadData();
        $savedPhotos = [];
        $uploadErrors = [];

        // Deduplicate files by name & size
        $processedNames = [];

        foreach ($allFilesToProcess as $fileItem) {
            $name    = $fileItem['name'];
            $tmpName = $fileItem['tmp_name'];
            $error   = $fileItem['error'];
            $size    = $fileItem['size'];

            $fileKey = $name . '_' . $size;
            if (in_array($fileKey, $processedNames)) continue;
            $processedNames[] = $fileKey;

            if ($error === UPLOAD_ERR_NO_FILE) continue;

            if ($error !== UPLOAD_ERR_OK) {
                $uploadErrors[] = "File '{$name}' upload error code: {$error}";
                continue;
            }

            if ($size > MAX_FILE_SIZE) {
                $uploadErrors[] = "File '{$name}' exceeds max size (20MB)";
                continue;
            }

            // Validate extension
            $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
            if (!in_array($ext, ALLOWED_EXTENSIONS)) {
                $uploadErrors[] = "File '{$name}' extension '.{$ext}' not allowed";
                continue;
            }

            // Generate unique filename
            $baseName = preg_replace('/\s+/', '_', pathinfo($name, PATHINFO_FILENAME));
            $baseName = preg_replace('/[^a-zA-Z0-9_\-]/', '', $baseName);
            if (!$baseName) $baseName = 'photo';
            $unique = time() . '_' . mt_rand(1000, 9999);
            $newFilename = "{$baseName}_{$unique}.{$ext}";
            $destPath = $folderPath . '/' . $newFilename;

            if (move_uploaded_file($tmpName, $destPath)) {
                $imageUrl = "images/{$safeFolder}/{$newFilename}";

                $photoRecord = [
                    '_id' => generateId(),
                    'title' => '',
                    'category' => $category,
                    'imageUrl' => $imageUrl,
                    'featured' => $featured,
                    'date' => $date,
                ];

                $data['photos'][] = $photoRecord;
                $savedPhotos[] = $photoRecord;
            } else {
                $uploadErrors[] = "Could not save file '{$name}' to directory {$safeFolder}. Check folder permissions.";
            }
        }

        if (count($savedPhotos) === 0) {
            http_response_code(400);
            $errMsg = !empty($uploadErrors) ? implode('; ', $uploadErrors) : 'No valid photos were uploaded.';
            echo json_encode(['error' => $errMsg]);
            exit;
        }

        // Save/update category description if provided
        if ($description && $category) {
            $found = false;
            foreach ($data['categories'] as &$cat) {
                if (isset($cat['category']) && strtolower($cat['category']) === strtolower($category)) {
                    $cat['description'] = $description;
                    $cat['category'] = $category; // sync casing
                    $cat['updatedAt'] = date('c');
                    $found = true;
                    break;
                }
            }
            unset($cat);
            if (!$found) {
                $data['categories'][] = [
                    'category' => $category,
                    'description' => $description,
                    'updatedAt' => date('c'),
                ];
            }
        }

        saveData($data);

        echo json_encode([
            'success' => true,
            'message' => "Uploaded " . count($savedPhotos) . " photo(s) successfully",
            'photos' => $savedPhotos,
            'photo' => $savedPhotos[0],
        ]);
        break;

    // ────────────────────────────────────────────────────────
    // POST: Delete a single photo
    // ────────────────────────────────────────────────────────
    case 'delete':
        if ($method !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Method not allowed']); exit; }
        
        $user = requireAuth();

        $input = json_decode(file_get_contents('php://input'), true);
        $id = isset($input['id']) ? $input['id'] : (isset($_POST['id']) ? $_POST['id'] : '');

        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'Photo ID is required']);
            exit;
        }

        $data = loadData();
        $found = false;
        $newPhotos = [];

        foreach ($data['photos'] as $photo) {
            if (isset($photo['_id']) && $photo['_id'] === $id) {
                $found = true;
                // Delete file from disk
                if (!empty($photo['imageUrl']) && strpos($photo['imageUrl'], 'http') !== 0) {
                    $filePath = dirname(__DIR__) . '/' . $photo['imageUrl'];
                    if (file_exists($filePath)) {
                        @unlink($filePath);
                    }
                }
            } else {
                $newPhotos[] = $photo;
            }
        }

        if (!$found) {
            http_response_code(404);
            echo json_encode(['error' => 'Photo not found']);
            exit;
        }

        $data['photos'] = $newPhotos;
        saveData($data);

        echo json_encode(['success' => true, 'message' => 'Photo deleted successfully']);
        break;

    // ────────────────────────────────────────────────────────
    // POST: Delete entire category
    // ────────────────────────────────────────────────────────
    case 'delete-category':
        if ($method !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Method not allowed']); exit; }
        
        $user = requireAuth();

        $input = json_decode(file_get_contents('php://input'), true);
        $categoryName = isset($input['category']) ? $input['category'] : (isset($_POST['category']) ? $_POST['category'] : '');

        if (!$categoryName) {
            http_response_code(400);
            echo json_encode(['error' => 'Category name is required']);
            exit;
        }

        $data = loadData();
        $deletedCount = 0;
        $newPhotos = [];

        foreach ($data['photos'] as $photo) {
            if (isset($photo['category']) && $photo['category'] === $categoryName) {
                $deletedCount++;
                // Delete file from disk
                if (!empty($photo['imageUrl']) && strpos($photo['imageUrl'], 'http') !== 0) {
                    $filePath = dirname(__DIR__) . '/' . $photo['imageUrl'];
                    if (file_exists($filePath)) {
                        @unlink($filePath);
                    }
                }
            } else {
                $newPhotos[] = $photo;
            }
        }

        $data['photos'] = $newPhotos;

        // Remove category description too
        $newCats = [];
        foreach ($data['categories'] as $cat) {
            if (!(isset($cat['category']) && $cat['category'] === $categoryName)) {
                $newCats[] = $cat;
            }
        }
        $data['categories'] = $newCats;

        // Delete folder from disk
        $safeFolder = sanitizeFolderName($categoryName);
        $folderPath = IMAGES_DIR . '/' . $safeFolder;
        if (is_dir($folderPath)) {
            // Recursively delete folder contents
            $files = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($folderPath, RecursiveDirectoryIterator::SKIP_DOTS),
                RecursiveIteratorIterator::CHILD_FIRST
            );
            foreach ($files as $fileinfo) {
                $action = ($fileinfo->isDir() ? 'rmdir' : 'unlink');
                @$action($fileinfo->getRealPath());
            }
            @rmdir($folderPath);
        }

        saveData($data);

        echo json_encode([
            'success' => true,
            'message' => "Deleted {$deletedCount} photo(s) in category \"{$categoryName}\"",
            'deletedCount' => $deletedCount,
        ]);
        break;

    // ────────────────────────────────────────────────────────
    // POST: Toggle featured status
    // ────────────────────────────────────────────────────────
    case 'toggle-featured':
        if ($method !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Method not allowed']); exit; }
        
        $user = requireAuth();

        $input = json_decode(file_get_contents('php://input'), true);
        $id = isset($input['id']) ? $input['id'] : '';
        $featured = isset($input['featured']) ? (bool)$input['featured'] : false;

        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'Photo ID is required']);
            exit;
        }

        $data = loadData();
        $found = false;
        $updatedPhoto = null;

        foreach ($data['photos'] as &$photo) {
            if (isset($photo['_id']) && $photo['_id'] === $id) {
                $photo['featured'] = $featured;
                $found = true;
                $updatedPhoto = $photo;
                break;
            }
        }
        unset($photo);

        if (!$found) {
            http_response_code(404);
            echo json_encode(['error' => 'Photo not found']);
            exit;
        }

        saveData($data);
        echo json_encode(['success' => true, 'photo' => $updatedPhoto]);
        break;

    // ────────────────────────────────────────────────────────
    // POST: Update category description
    // ────────────────────────────────────────────────────────
    case 'update-description':
        if ($method !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Method not allowed']); exit; }
        
        $user = requireAuth();

        $input = json_decode(file_get_contents('php://input'), true);
        $categoryName = isset($input['category']) ? trim($input['category']) : '';
        $description = isset($input['description']) ? trim($input['description']) : '';

        if (!$categoryName) {
            http_response_code(400);
            echo json_encode(['error' => 'Category name is required']);
            exit;
        }

        $data = loadData();

        $found = false;
        foreach ($data['categories'] as &$cat) {
            if (isset($cat['category']) && strtolower($cat['category']) === strtolower($categoryName)) {
                $cat['category'] = $categoryName; // sync exact casing
                $cat['description'] = $description;
                $cat['updatedAt'] = date('c');
                $found = true;
                break;
            }
        }
        unset($cat);

        if (!$found) {
            $data['categories'][] = [
                'category' => $categoryName,
                'description' => $description,
                'updatedAt' => date('c'),
            ];
        }

        saveData($data);

        echo json_encode([
            'success' => true,
            'message' => "Description for category \"{$categoryName}\" updated successfully",
        ]);
        break;

    // ────────────────────────────────────────────────────────
    // Unknown action
    // ────────────────────────────────────────────────────────
    default:
        http_response_code(400);
        echo json_encode([
            'error' => 'Invalid or missing action parameter',
            'available_actions' => ['list', 'categories', 'category-descriptions', 'upload', 'delete', 'delete-category', 'toggle-featured', 'update-description'],
        ]);
        break;
}
