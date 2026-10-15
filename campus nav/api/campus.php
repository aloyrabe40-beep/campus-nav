<?php
// The whole campus JSON document.
//   GET  /api/campus.php                 -> current document
//   GET  /api/campus.php?versions=1      -> version history
//   GET  /api/campus.php?version=3       -> an older version
//   POST /api/campus.php  (X-API-Key)    -> save a new version
//        body: the JSON, or {"data":..., "note":"...", "baseVersion":N}
//        baseVersion = the version you loaded. If the database has moved on, the save is refused with 409
//        so two editors cannot silently overwrite each other. (0 = "I expect the database to be empty".)
//   POST /api/campus.php?restore=3       -> save version 3 again as the newest version (body: {} or {"baseVersion":N})
require __DIR__ . '/lib.php';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $c = loadCampus();
    if (isset($_GET['versions'])) {
        $st = db()->prepare('SELECT version, note, created_at FROM campus_versions WHERE campus_id = ? ORDER BY version DESC LIMIT 50');
        $st->execute([$c['id']]);
        out(['current' => (int) $c['version'], 'versions' => $st->fetchAll()]);
    }
    if (isset($_GET['version'])) {
        $st = db()->prepare('SELECT version, data, note, created_at FROM campus_versions WHERE campus_id = ? AND version = ?');
        $st->execute([$c['id'], (int) $_GET['version']]);
        $v = $st->fetch();
        if (!$v) fail('Version not found', 404);
        $v['data'] = json_decode($v['data'], true);
        out($v);
    }
    out(['name' => $c['name'], 'version' => (int) $c['version'], 'updatedAt' => $c['updated_at'], 'data' => $c['data']]);
}

if ($method !== 'POST') fail('Method not allowed', 405);
requireKey();

$restore = isset($_GET['restore']) ? (int) $_GET['restore'] : 0;
$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) {
    if ($restore) $body = []; else fail('Body must be valid JSON');
}

if ($restore) {
    $st = db()->prepare('SELECT v.data FROM campus_versions v JOIN campuses c ON c.id = v.campus_id WHERE c.slug = ? AND v.version = ?');
    $st->execute([config()['campus_slug'], $restore]);
    $old = $st->fetchColumn();
    if ($old === false) fail('Version not found', 404);
    $doc  = json_decode($old, true);
    $note = 'Restore of version ' . $restore;
} else {
    $doc  = isset($body['floors']) ? $body : ($body['data'] ?? null);
    $note = isset($body['floors']) ? null : clip($body['note'] ?? '', 255);
}
$base = (isset($body['baseVersion']) && is_numeric($body['baseVersion'])) ? (int) $body['baseVersion'] : null;

$errs = validateCampus($doc);
if ($errs) fail('Validation failed', 422, ['details' => $errs]);

$name = clip($doc['campus']['name'] ?? 'Campus', 160);
$json = json_encode($doc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
$pdo  = db();
$pdo->beginTransaction();
try {
    $st = $pdo->prepare('SELECT id, version FROM campuses WHERE slug = ? FOR UPDATE');
    $st->execute([config()['campus_slug']]);
    $row = $st->fetch();
    $current = $row ? (int) $row['version'] : 0;

    if ($base !== null && $base !== $current) {
        $pdo->rollBack();
        fail("Version conflict: the database is at version $current but your changes are based on version $base. Load the latest version and re-apply your changes.", 409, ['current' => $current]);
    }

    if ($row) {
        $id = (int) $row['id']; $ver = $current + 1;
        $pdo->prepare('UPDATE campuses SET name = ?, data = ?, version = ? WHERE id = ?')->execute([$name, $json, $ver, $id]);
    } else {
        $ver = 1;
        $pdo->prepare('INSERT INTO campuses (slug, name, data, version) VALUES (?, ?, ?, 1)')->execute([config()['campus_slug'], $name, $json]);
        $st = $pdo->prepare('SELECT id FROM campuses WHERE slug = ?');   // works on MySQL and PostgreSQL
        $st->execute([config()['campus_slug']]);
        $id = (int) $st->fetchColumn();
    }
    $pdo->prepare('INSERT INTO campus_versions (campus_id, version, data, note) VALUES (?, ?, ?, ?)')->execute([$id, $ver, $json, $note]);

    // Keep the history bounded (config: max_versions).
    $keep = (int) (config()['max_versions'] ?? 200);
    if ($keep > 0 && $ver > $keep) {
        $pdo->prepare('DELETE FROM campus_versions WHERE campus_id = ? AND version <= ?')->execute([$id, $ver - $keep]);
    }
    $pdo->commit();
} catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
out(['ok' => true, 'version' => $ver]);
