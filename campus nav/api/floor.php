<?php
// GET /api/floor.php?n=2 -> {floor, name, northOffset, nodes:[{id,x,y,type,label}], version}
require __DIR__ . '/lib.php';
$n = $_GET['n'] ?? '';
if (!is_string($n) || !ctype_digit($n)) fail('Parameter n (floor number) is required');
$c = loadCampus();
foreach ($c['data']['floors'] as $f) {
    if ((int) $f['floor'] !== (int) $n) continue;
    $nodes = array_map(function ($p) {
        return ['id' => $p['id'], 'x' => (float) $p['x'], 'y' => (float) $p['y'], 'type' => $p['type'] ?? 'corridor', 'label' => $p['label'] ?? ''];
    }, $f['nodes']);
    out(['floor' => (int) $f['floor'], 'name' => $f['name'] ?? ('Floor ' . $f['floor']), 'northOffset' => (float) ($f['northOffset'] ?? 0),
         'nodes' => $nodes, 'version' => (int) $c['version']]);
}
fail('Floor not found', 404);
