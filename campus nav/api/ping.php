<?php
// GET /api/ping.php -> connection check for setup. Reveals nothing beyond ok/not ok.
require __DIR__ . '/lib.php';
try {
    $has = (int) db()->query("SELECT COUNT(*) FROM campuses WHERE is_active = 1")->fetchColumn() > 0;
    out(['ok' => true, 'database' => true, 'campusLoaded' => $has]);
} catch (Throwable $e) {
    error_log('campus-ar ping: ' . $e->getMessage());
    $extra = (config()['env'] ?? 'production') === 'local' ? ['detail' => $e->getMessage()] : [];
    fail('Database unreachable', 503, $extra);
}
