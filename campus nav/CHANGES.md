# CampusAR - what changed

## Fixed
- **Missing stair/junction stickers**: `db/waypoint-qr-codes.pdf` has the 6 stickers the seed defines (verified to decode). The editor now warns when a stairs waypoint has no QR.
- **Camera-friendly QR codes**: set "QR link base" in the editor (e.g. `https://yourhost/campus-ar/navigator/`) and stickers encode `...?q=F2/f2S`. Opening one on any phone camera loads the navigator with the spot pre-filled. `campus://` codes keep working.
- **Compass drift**: each QR waypoint can store "Facing when scanning" (plan degrees). The navigator re-zeros its heading on every scan.
- **Editors overwriting each other**: the editor sends `baseVersion`; `campus.php` answers 409 if the database moved on.
- **Rollback + history cap**: `POST api/campus.php?restore=N`; `max_versions` (default 200) prunes old versions.
- **Navigator**: empty-route guard, reroute from the nearer end of the segment, single scan loop, `pointercancel`, "Retry connection" button, "look up while you walk" note.
- **Config/security**: production mode refuses default key / root DB user; `display_errors` off; DB errors no longer leak user/host; constant-time key check; `ping.php` link removed from the home page.
- **Self-hosted libraries** in `vendor/` (jsQR 1.4.0, qrcode-generator 1.4.4, jsPDF 2.5.1) - no CDN dependency.
- **PostgreSQL**: `db/pgsql_schema.sql` added.

## Backend files that were missing (now written)
`api/lib.php`, `rooms.php`, `floor.php`, `route.php`, `ping.php` - written to match how `campus.php` and the navigator already call them.
- `lib.php`: JSON output/errors, CORS, API-key check (`hash_equals`), `loadCampus()`, `validateCampus()`, Dijkstra routing across floors (stairs connectors, 15 m default).
- `route.php?from=<node>&to=<room>[&avoid=stairs]`, `floor.php?n=<floor>`, `rooms.php`, `ping.php` (ok / not ok only).
- Tested under PHP 8.4 against the seed: all files parse, the seed and editor-exported documents validate, bad documents are rejected, routes are correct (e.g. f1S -> room 303 = 68 m via the stairs).
- NOT tested: the real MySQL queries (no database was available here) - run through the XAMPP steps once.

## Not changed
- Offline routing (service worker + client-side Dijkstra), elevator/"avoid stairs" in the navigator UI (the API supports `avoid=stairs`), and a restore button in the editor UI.
