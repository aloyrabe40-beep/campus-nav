<?php
// Central settings. Defaults match a stock XAMPP install (MySQL user "root", empty password).
// Those defaults only work on localhost / a private LAN address. On a real server the app refuses to run
// until you set real values with environment variables - never commit secrets.
$host    = $_SERVER['SERVER_NAME'] ?? 'localhost';
$isLocal = PHP_SAPI === 'cli' || $host === 'localhost' || preg_match('/\.(local|lan|test)$/i', $host)
        || (filter_var($host, FILTER_VALIDATE_IP) && !filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE));
$env = getenv('APP_ENV') ?: ($isLocal ? 'local' : 'production');

$cfg = [
    'env' => $env,
    'db' => [
        'driver'  => getenv('DB_DRIVER') ?: 'mysql',      // 'mysql' (XAMPP / MariaDB) or 'pgsql' (PostgreSQL / Supabase)
        'host'    => getenv('DB_HOST') ?: '127.0.0.1',
        'port'    => getenv('DB_PORT') ?: '3306',          // pgsql: 5432
        'name'    => getenv('DB_NAME') ?: 'campus_ar',     // pgsql: postgres
        'user'    => getenv('DB_USER') ?: 'root',
        'pass'    => getenv('DB_PASS') !== false ? getenv('DB_PASS') : '',
        'sslmode' => getenv('DB_SSLMODE') ?: 'require',    // pgsql only
    ],
    // The editor must send this in the X-API-Key header to change data.
    // Type the same value into the editor's "API key" box.
    'api_key'        => getenv('CAMPUS_API_KEY') ?: 'local-test-key',
    'campus_slug'    => getenv('CAMPUS_SLUG') ?: 'main-campus',
    'allowed_origin' => getenv('ALLOWED_ORIGIN') ?: '*',
    'max_versions'   => (int) (getenv('CAMPUS_MAX_VERSIONS') ?: 200),   // older saved versions are pruned
];

if ($env === 'production') {
    ini_set('display_errors', '0');             // never print PHP errors to visitors
    $bad = [];
    if ($cfg['api_key'] === 'local-test-key' || strlen($cfg['api_key']) < 16) $bad[] = 'CAMPUS_API_KEY (set a random value of 16+ characters)';
    if ($cfg['db']['user'] === 'root' || $cfg['db']['pass'] === '')           $bad[] = 'DB_USER / DB_PASS (do not use root or an empty password)';
    if ($bad) {
        error_log('campus-ar: refusing to start in production. Fix: ' . implode('; ', $bad));
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Server is not configured for production use']);
        exit;
    }
    if ($cfg['allowed_origin'] === '*') error_log('campus-ar: ALLOWED_ORIGIN is "*"; set it to your site origin.');
}
return $cfg;
