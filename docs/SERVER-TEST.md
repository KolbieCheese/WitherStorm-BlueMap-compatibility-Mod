# Dedicated-server smoke test

Run against a disposable test world, with Forge 47.4.0, Wither Storm 4.2.1, a compatible BlueMap build, and this mod. These steps have not yet been executed in a running KNCraft server.

1. Start the server, finish BlueMap setup, and confirm its map loads. Run `/witherstormbluemap status`: the API should be ready.
2. Summon one storm with `/summon witherstormmod:wither_storm ~ ~ ~`. Open the Wither Storms layer and confirm the dedicated head icon appears near its coordinates.
3. Summon a second storm elsewhere. Confirm two separately identified markers. Move one and confirm only its icon follows, with the same smooth transition used by BlueMap players.
4. Toggle the layer off and on. Wait through an ordinary BlueMap marker refresh (at least 10 seconds); visibility and live positions must remain intact. Confirm real player markers still update.
5. Remove one storm using the storm mod's supported removal method. Confirm the other remains. Observe the mod's evolution/splitting behavior and check that segment markers appear independently when `showSegments` is enabled.
6. If testing dimension transfers, ensure both dimensions have BlueMap maps. Transfer a test storm and confirm it disappears from the old map and appears in the destination; also test two map views of one dimension.
7. Reload BlueMap, then refresh the web page. Confirm the layer recovers without duplicates. Restart the server and verify persistent storms are rediscovered.
8. Stop the server and confirm the published live feed is empty. If the web host remains online, the layer should empty; a frozen feed should expire within 15 seconds of its last observed change.

Useful diagnostics:

- `witherstorm-bluemap/live.json` under the BlueMap web root: UUIDs and coordinates grouped by **BlueMap map ID**, plus a changing `generatedAt` timestamp.
- Browser network panel: one `live.json` request about every second, HTTP 200, fresh JSON, correct `storm.png` URL.
- Server log: messages containing `Wither Storm` or `witherstormbluemap`.
- Zero tracked entities: verify actual loaded entity registry types. The integration intentionally does not load additional chunks to search for storms.
- API waiting: check BlueMap setup and server logs; there must be an enabled BlueMap instance.
- Layer present but no icons: refresh the browser, check the extension request and JavaScript console, then check the feed's current map ID.
