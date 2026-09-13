# Dedicated-server smoke test

Run against a disposable test world, with Forge 47.4.0, Wither Storm 4.2.1, a compatible BlueMap build, and this mod. The server owner has confirmed the original release works; the new phase-aware icons still require the evolution checks below.

1. Start the server, finish BlueMap setup, and confirm its map loads. Run `/witherstormbluemap status`: the API should be ready.
2. Summon one storm with `/summon witherstormmod:wither_storm ~ ~ ~`. Open the Wither Storms layer and confirm the dedicated head icon appears near its coordinates. Verify terrain remains visible outside its white head outlines: no square purple/checkerboard background. Zoom in and out beside a player marker; the frame should shrink from 40 to 20 pixels at the player's own distance thresholds.
3. Summon a second storm elsewhere. Confirm two separately identified markers. Move one and confirm only its icon follows, with the same smooth transition used by BlueMap players.
4. Toggle the layer off and on. Wait through an ordinary BlueMap marker refresh (at least 10 seconds); visibility and live positions must remain intact. Confirm real player markers still update.
5. Observe evolution through the main phases 0–7, or use the storm mod's supported phase command in the disposable world. Confirm the number and appropriate skull/mutated head arrangement change without a page refresh or interruption to movement. Keep another storm in a different phase to check independence. During phase 6, confirm disabled side heads disappear and regrown heads return. Check that segment markers appear independently when `showSegments` is enabled. Fractional body stages keep their main-phase number. Remove one storm using the storm mod's supported removal method and confirm the other remains.
6. If testing dimension transfers, ensure both dimensions have BlueMap maps. Transfer a test storm and confirm it disappears from the old map and appears in the destination; also test two map views of one dimension.
7. Reload BlueMap, then refresh the web page. Confirm the layer recovers without duplicates. Restart the server and verify persistent storms are rediscovered.
8. Stop the server and confirm the published live feed is empty. If the web host remains online, the layer should empty; a frozen feed should expire within 15 seconds of its last observed change.

## Empty-server tracking

1. In the test server world's `serverconfig/witherstormmod-server.toml`, set the existing `server.misc.shouldChunkLoadWhenNoPlayers` entry to `true` with the server stopped, then restart. Version 4.2.1 defaults this option to `false` and releases storm chunk tickets when the last player logs out.
2. With two storms loaded, leave the Minecraft server so the console `list` command reports zero players. Keep BlueMap open for at least 60 seconds. Both storm markers must remain while the entities are loaded; moving storms must continue updating. A stationary storm should also remain visible.
3. While still offline, reload the map in a fresh browser tab. Confirm the same storms appear without anyone logging into Minecraft.
4. Check `witherstorm-bluemap/live.json`: `generatedAt` should keep increasing, and the storm UUIDs should remain. Run `witherstormbluemap status` from the server console to compare the loaded count.
5. If the timestamp advances but the storm list empties, inspect the storm mod's chunk-loading setting on the actual server world. If the timestamp stops advancing, check for host sleep or a mod that pauses the empty server. If the feed contains storms but the map does not, check browser requests and JavaScript errors.

Useful diagnostics:

- `witherstorm-bluemap/live.json` under the BlueMap web root: UUIDs, coordinates, integer `phase`, and boolean `otherHeadsDisabled` grouped by **BlueMap map ID**, plus a changing `generatedAt` timestamp.
- Browser network panel: one `live.json` request about every second, HTTP 200, fresh JSON, and successful versioned requests for `storms.css`, `storm.png`, and `wither.png`.
- Server log: messages containing `Wither Storm` or `witherstormbluemap`.
- Zero tracked entities: verify actual loaded entity registry types. The integration intentionally does not load additional chunks to search for storms.
- API waiting: check BlueMap setup and server logs; there must be an enabled BlueMap instance.
- Layer present but no icons: refresh the browser, check the extension request and JavaScript console, then check the feed's current map ID.
