<?php
// Shared helpers for every endpoint: JSON output, CORS, API-key check, validation, campus loading, routing.
// PHP 7.4+ compatible.
require_once __DIR__ . '/db.php';

ini_set('display_errors', '0');             // errors go to the server log, never into the JSON
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

// ---- CORS (same-origin setups don't need it, but it is harmless) ------------------------------------------------
$__origin = config()['allowed_origin'] ?? '*';
header('Access-Control-Allow-Origin: ' . $__origin);
if ($__origin !== '*') header('Vary: Origin');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }

// ---- output -----------------------------------------------------------------------------------------------------
function out($data, int $code = 200): void
{
    http_response_code($code);
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    echo $json === false ? '{"error":"Could not encode response"}' : $json;
    exit;
}

function fail(string $msg, int $code = 400, array $extra = []): void
{
    out(array_merge(['error' => $msg], $extra), $code);
}

set_exception_handler(function (Throwable $e) {
    error_log('campus-ar: ' . get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    // On a local XAMPP the message helps; on a real server visitors only get a generic error.
    $extra = (config()['env'] ?? 'production') === 'local' ? ['detail' => $e->getMessage()] : [];
    fail('Server error', 500, $extra);
});

function clip($s, int $n): string
{
    $s = trim((string) $s);
    return function_exists('mb_substr') ? mb_substr($s, 0, $n, 'UTF-8') : substr($s, 0, $n);
}

// ---- auth -------------------------------------------------------------------------------------------------------
function requireKey(): void
{
    $key = (string) (config()['api_key'] ?? '');
    $sent = (string) ($_SERVER['HTTP_X_API_KEY'] ?? '');
    if ($key === '' || !hash_equals($key, $sent)) fail('Unauthorized: missing or wrong API key', 401);
}

// ---- campus document --------------------------------------------------------------------------------------------
// Returns the active campus row with `data` already decoded into an array.
function loadCampus(): array
{
    static $cache = null;
    if ($cache !== null) return $cache;
    $st = db()->prepare('SELECT id, name, data, version, updated_at FROM campuses WHERE slug = ? AND is_active = 1');
    $st->execute([config()['campus_slug']]);
    $row = $st->fetch();
    if (!$row) fail('No campus data yet. Run db/mysql_seed.sql, or import a campus in the editor and save it.', 404);
    $doc = json_decode((string) $row['data'], true);
    if (!is_array($doc) || !isset($doc['floors']) || !is_array($doc['floors'])) fail('Stored campus data is damaged', 500);
    $row['data'] = $doc;
    return $cache = $row;
}

// Returns a list of human-readable problems; an empty list means the document is acceptable.
function validateCampus($doc): array
{
    if (!is_array($doc)) return ['The document must be a JSON object'];
    $e = [];
    $add = function (string $m) use (&$e) { if (count($e) < 25) $e[] = $m; };
    $str = function ($v, int $max) { return is_string($v) && strlen($v) <= $max; };

    if (isset($doc['campus'])) {
        if (!is_array($doc['campus'])) $add('"campus" must be an object');
        else {
            if (isset($doc['campus']['name']) && !$str($doc['campus']['name'], 160)) $add('campus.name must be text up to 160 characters');
            if (isset($doc['campus']['qrBase']) && (!$str($doc['campus']['qrBase'], 300) || !preg_match('#^https?://\S+$#i', $doc['campus']['qrBase']))) $add('campus.qrBase must be an http(s) URL');
        }
    }
    if (!isset($doc['floors']) || !is_array($doc['floors']) || !$doc['floors']) return array_merge($e, ['"floors" must be a non-empty list']);
    if (count($doc['floors']) > 50) return array_merge($e, ['Too many floors (max 50)']);

    $allNodes = [];     // id => true, across the whole campus (ids must be globally unique)
    $floorNums = [];
    $roomIds = [];
    foreach ($doc['floors'] as $fi => $f) {
        $tag = 'Floor #' . ($fi + 1);
        if (!is_array($f)) { $add("$tag must be an object"); continue; }
        $num = $f['floor'] ?? null;
        if (is_string($num) && ctype_digit($num)) $num = (int) $num;
        if (!is_int($num) || $num < 0 || $num > 999) { $add("$tag: \"floor\" must be a whole number 0-999"); continue; }
        $tag = 'Floor ' . $num;
        if (isset($floorNums[$num])) $add("$tag appears more than once");
        $floorNums[$num] = true;
        if (isset($f['name']) && !$str($f['name'], 160)) $add("$tag: name must be text up to 160 characters");
        if (isset($f['northOffset']) && !is_numeric($f['northOffset'])) $add("$tag: northOffset must be a number");

        $ids = [];
        $nodes = $f['nodes'] ?? null;
        if (!is_array($nodes) || !$nodes) { $add("$tag: needs at least one node"); continue; }
        if (count($nodes) > 2000) { $add("$tag: too many nodes (max 2000)"); continue; }
        foreach ($nodes as $n) {
            if (!is_array($n) || !isset($n['id']) || !is_string($n['id']) || !preg_match('/^\w{1,64}$/', $n['id'])) { $add("$tag: every node needs an id of letters, numbers or _"); continue; }
            $id = $n['id'];
            if (isset($allNodes[$id])) $add("$tag: node id \"$id\" is used more than once (ids must be unique across all floors)");
            $allNodes[$id] = true; $ids[$id] = true;
            foreach (['x', 'y'] as $k) {
                if (!isset($n[$k]) || !is_numeric($n[$k]) || !is_finite((float) $n[$k]) || abs((float) $n[$k]) > 100000) $add("$tag: node \"$id\" needs a numeric $k");
            }
            if (isset($n['type']) && (!is_string($n['type']) || !preg_match('/^\w{1,32}$/', $n['type']))) $add("$tag: node \"$id\" has an invalid type");
            if (isset($n['label']) && !$str($n['label'], 160)) $add("$tag: node \"$id\" label is too long");
        }
        foreach (($f['edges'] ?? []) as $ed) {
            if (!is_array($ed) || count($ed) !== 2 || !is_string($ed[0] ?? null) || !is_string($ed[1] ?? null)) { $add("$tag: each edge must be a pair of node ids"); continue; }
            if (!isset($ids[$ed[0]]) || !isset($ids[$ed[1]])) $add("$tag: edge {$ed[0]} - {$ed[1]} refers to a node that is not on this floor");
            elseif ($ed[0] === $ed[1]) $add("$tag: edge {$ed[0]} connects a node to itself");
        }
        foreach (($f['rooms'] ?? []) as $r) {
            $rid = is_array($r) && isset($r['id']) && (is_string($r['id']) || is_int($r['id'])) ? trim((string) $r['id']) : '';
            if ($rid === '' || strlen($rid) > 64) { $add("$tag: every room needs an id (room number)"); continue; }
            if (isset($roomIds[$rid])) $add("$tag: room \"$rid\" is used more than once (room numbers must be unique across the campus)");
            $roomIds[$rid] = true;
            if (isset($r['name']) && !$str($r['name'], 160)) $add("$tag: room \"$rid\" name is too long");
            if (!isset($r['node']) || !is_string($r['node']) || !isset($ids[$r['node']])) $add("$tag: room \"$rid\" must point to a node on this floor");
        }
        foreach (($f['qr'] ?? []) as $q) {
            if (!is_array($q) || !isset($q['node']) || !is_string($q['node']) || !isset($ids[$q['node']])) { $add("$tag: a QR entry points to a node that is not on this floor"); continue; }
            $p = $q['payload'] ?? '';
            if (!is_string($p) || strlen($p) > 500 || !preg_match('#^(campus://F\d+/\w+(\?.*)?|https?://\S+)$#i', $p)) $add("$tag: QR for \"{$q['node']}\" has an invalid payload");
            if (isset($q['heading']) && !is_numeric($q['heading'])) $add("$tag: QR heading for \"{$q['node']}\" must be a number");
        }
    }
    foreach (($doc['connectors'] ?? []) as $c) {
        if (!is_array($c) || !isset($c['nodes']) || !is_array($c['nodes']) || count($c['nodes']) < 2) { $add('Each connector needs a list of at least 2 nodes'); continue; }
        foreach ($c['nodes'] as $id) if (!is_string($id) || !isset($allNodes[$id])) $add('Connector refers to an unknown node' . (is_string($id) ? " \"$id\"" : ''));
        if (isset($c['cost']) && (!is_numeric($c['cost']) || $c['cost'] < 0)) $add('Connector cost must be a number of 0 or more');
    }
    return $e;
}

// ---- routing ----------------------------------------------------------------------------------------------------
// Graph over all floors: corridor edges weigh their length in metres, stair connectors weigh their `cost`.
// Connector nodes are linked floor-to-floor, so a trip 1 -> 3 passes through the floor-2 landing.
function campusGraph(array $doc, bool $avoidStairs = false): array
{
    $nodes = []; $adj = [];
    foreach ($doc['floors'] as $f) foreach ($f['nodes'] as $n) {
        $nodes[$n['id']] = ['id' => $n['id'], 'floor' => (int) $f['floor'], 'x' => (float) $n['x'], 'y' => (float) $n['y'],
                            'type' => $n['type'] ?? 'corridor', 'label' => $n['label'] ?? ''];
        $adj[$n['id']] = [];
    }
    foreach ($doc['floors'] as $f) foreach (($f['edges'] ?? []) as $ed) {
        if (!isset($nodes[$ed[0]], $nodes[$ed[1]])) continue;
        $w = hypot($nodes[$ed[0]]['x'] - $nodes[$ed[1]]['x'], $nodes[$ed[0]]['y'] - $nodes[$ed[1]]['y']);
        $adj[$ed[0]][] = [$ed[1], $w]; $adj[$ed[1]][] = [$ed[0], $w];
    }
    foreach (($doc['connectors'] ?? []) as $c) {
        if ($avoidStairs && ($c['type'] ?? 'stairs') === 'stairs') continue;
        $ids = array_values(array_filter($c['nodes'], function ($id) use ($nodes) { return isset($nodes[$id]); }));
        usort($ids, function ($a, $b) use ($nodes) { return $nodes[$a]['floor'] <=> $nodes[$b]['floor']; });
        $cost = isset($c['cost']) ? (float) $c['cost'] : 15.0;
        for ($i = 0; $i + 1 < count($ids); $i++) { $adj[$ids[$i]][] = [$ids[$i + 1], $cost]; $adj[$ids[$i + 1]][] = [$ids[$i], $cost]; }
    }
    return [$nodes, $adj];
}

function findRoomNode(array $doc, string $room): ?string
{
    foreach ($doc['floors'] as $f) foreach (($f['rooms'] ?? []) as $r) {
        if (trim((string) $r['id']) === $room) return $r['node'];
    }
    return null;
}

// Dijkstra. Returns the list of node ids from $from to $to (inclusive) and the total distance, or null if unreachable.
function shortestPath(array $adj, string $from, string $to): ?array
{
    $dist = [$from => 0.0]; $prev = []; $done = [];
    $q = new SplPriorityQueue();
    $q->insert($from, 0.0);
    while (!$q->isEmpty()) {
        $u = $q->extract();
        if (isset($done[$u])) continue;
        $done[$u] = true;
        if ($u === $to) break;
        foreach ($adj[$u] as [$v, $w]) {
            $nd = $dist[$u] + $w;
            if (!isset($dist[$v]) || $nd < $dist[$v] - 1e-9) { $dist[$v] = $nd; $prev[$v] = $u; $q->insert($v, -$nd); }
        }
    }
    if (!isset($dist[$to])) return null;
    $path = [$to];
    while ($path[0] !== $from) array_unshift($path, $prev[$path[0]]);
    return [$path, $dist[$to]];
}
