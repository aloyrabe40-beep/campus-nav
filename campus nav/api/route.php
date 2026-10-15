<?php
// GET /api/route.php?from=<nodeId>&to=<roomNumber>[&avoid=stairs]
//  -> {path:[{id,floor,x,y,type,label}, ...], distance}
// The path may cross floors: consecutive points with different floor values are a stair trip.
require __DIR__ . '/lib.php';
$from = $_GET['from'] ?? ''; $to = $_GET['to'] ?? '';
if (!is_string($from) || !is_string($to) || $from === '' || $to === '') fail('Parameters "from" (node id) and "to" (room number) are required');
$doc = loadCampus()['data'];
[$nodes, $adj] = campusGraph($doc, ($_GET['avoid'] ?? '') === 'stairs');
if (!isset($nodes[$from])) fail('Unknown starting point', 404);
$target = findRoomNode($doc, trim($to)) ?? (isset($nodes[$to]) ? $to : null);   // a node id is accepted too
if ($target === null || !isset($nodes[$target])) fail('Unknown room', 404);
$res = shortestPath($adj, $from, $target);
if (!$res) fail('No route found between those points. Check that the floors are connected.', 404);
out(['path' => array_map(function ($id) use ($nodes) { return $nodes[$id]; }, $res[0]), 'distance' => round($res[1], 1)]);
