<?php
// Database connection (PDO). MySQL/MariaDB for XAMPP, PostgreSQL for Supabase. Every query uses prepared statements.
function config(): array
{
    static $cfg = null;
    return $cfg ??= require __DIR__ . '/config.php';
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;
    $d = config()['db'];
    if ($d['driver'] === 'pgsql') {
        $dsn = "pgsql:host={$d['host']};port={$d['port']};dbname={$d['name']};sslmode={$d['sslmode']}";
    } else {
        $dsn = "mysql:host={$d['host']};port={$d['port']};dbname={$d['name']};charset=utf8mb4";
    }
    try {
        $pdo = new PDO($dsn, $d['user'], $d['pass'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => true,
            PDO::ATTR_TIMEOUT            => 5,
        ]);
    } catch (PDOException $e) {
        // The original message can contain the DB user/host; log it, but don't pass it on to the visitor.
        error_log('campus-ar DB connection failed: ' . $e->getMessage());
        throw new RuntimeException('Database connection failed');
    }
    return $pdo;
}
