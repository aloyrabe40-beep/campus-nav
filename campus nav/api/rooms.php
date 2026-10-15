<?php
// GET /api/rooms.php -> [{id, name, floor, floorName, node}, ...] sorted by floor, then room number.
require __DIR__ . '/lib.php';
$doc = loadCampus()['data'];
$list = []; $seen = [];
foreach ($doc['floors'] as $f) {
    $nodes = [];
    foreach ($f['nodes'] as $n) $nodes[$n['id']] = true;
    foreach (($f['rooms'] ?? []) as $r) {
        $id = trim((string) ($r['id'] ?? ''));
        if ($id === '' || isset($seen[$id]) || !isset($nodes[$r['node'] ?? ''])) continue;   // the app keys rooms by number
        $seen[$id] = true;
        $list[] = ['id' => $id, 'name' => (string) ($r['name'] ?? ''), 'floor' => (int) $f['floor'],
                   'floorName' => (string) ($f['name'] ?? ('Floor ' . $f['floor'])), 'node' => $r['node']];
    }
}
usort($list, function ($a, $b) { return $a['floor'] <=> $b['floor'] ?: strnatcmp($a['id'], $b['id']); });
out($list);
