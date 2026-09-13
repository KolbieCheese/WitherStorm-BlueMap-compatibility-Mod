# Wither Storm BlueMap

A **server-side Forge 1.20.1 mod** that shows every loaded Cracker's Wither Storm on BlueMap, including multiple storms at once. Each storm uses its full entity UUID for identity, so movement and server restarts do not mix up markers.

The separate **Wither Storms** layer uses the mod's original storm-head artwork. Positions are sampled every 20 server ticks and polled by the browser every second. Movement uses **BlueMap's own animated `PlayerMarker` class**, including its one-second easing animation. Storms remain a separate marker type and do not enter the real player list. Hover a storm to see its name, dimension, and coordinates; select its entry in the layer to center the map on it.

## Compatibility

| Component | Target |
| --- | --- |
| Minecraft | 1.20.1 |
| Forge | 47.4.0 or newer 47.x; compiled against the KNCraft pack's 47.4.0 |
| Cracker's Wither Storm Mod | 4.2.1 for 1.20.1, as installed in KNCraft |
| BlueMap | 5.3 or 5.12 Forge builds targeting Minecraft 1.20.1 |
| Java | 17 for this mod; **BlueMap 5.12 itself requires Java 21** |

The Java integration compiles against BlueMapAPI 2.7.2. The web tests exercise the actual marker classes from BlueMap 5.3 and 5.12. Other BlueMap 5.x releases are allowed by the dependency metadata but have not been individually checked. The web extension depends on BlueMap's JavaScript classes, so major webapp changes may require an update.

BlueMap was **not installed** in the inspected KNCraft client instance. Choose the correct Forge artifact:

- Java 17 option: [`BlueMap-5.3-forge-1.20.jar`](https://github.com/BlueMap-Minecraft/BlueMap/releases/tag/v5.3).
- Java 21 option: [`bluemap-5.12-mc1.20-6-forge.jar`](https://github.com/BlueMap-Minecraft/BlueMap/releases/tag/v5.12). The plain `bluemap-5.12-forge.jar` targets newer Minecraft versions.

## Install

1. Stop the side-server.
2. Put `build/libs/witherstorm-bluemap-1.20.1-1.0.0.jar` in its `mods` folder, alongside the compatible Forge BlueMap JAR and `witherstormmod-1.20.1-4.2.1-all.jar`.
3. Start the server and complete [BlueMap's normal setup](https://bluemap.bluecolored.de/wiki/getting-started/Installation.html). BlueMap must be enabled and have a map configured for the storm's dimension.
4. Open BlueMap and refresh the browser once so it loads the installed extension. Enable **Wither Storms** in the map's marker menu if hidden.
5. Run `/witherstormbluemap status` as an operator, or `witherstormbluemap status` in the server console. It reports BlueMap readiness, loaded storms/segments, sampling interval, and update failures.

Install this integration on the **server only**; players do not need it in their client packs. It does not add blocks, entities, networking channels, or extra chunk tickets. The existing KNCraft installation and saved worlds have not been modified.

BlueMap's standard web server serves the extension automatically. It installs `witherstorm-bluemap/storms.js`, `storm.png`, and `live.json` beneath BlueMap's configured web root and registers the script through the API. No manual JavaScript edits are needed.

For an external web host, serve or continuously synchronize that directory too, including the changing `live.json`. Exclude that JSON from reverse-proxy/CDN caching. A deployment that copies only rendered tiles cannot deliver live storm positions.

## Configuration

Forge creates `<world>/serverconfig/witherstormbluemap-server.toml`:

```toml
# 1–200 ticks; default is one second at 20 TPS.
updateIntervalTicks = 20
# Track independently moving storm segments as well as main storms.
showSegments = true
# Viewers can always toggle the Wither Storms layer.
defaultHidden = false
```

Edit with the server stopped. Changing sampling frequency does not change the browser's one-second player-style polling. This is near-real-time tracking, with sampling, network, and native animation latency; it is not a 20-FPS entity stream. The terrain beneath a storm still follows BlueMap's normal rendering schedule.

All BlueMap maps for a matching dimension receive the layer, even when their map IDs differ from the dimension ID. The tracker discovers already-loaded storms at server startup, then uses entity join/leave events. Removed or unloaded storms disappear on the next update; dimension transfers move them between maps. Temporary defeated states are retained while the entity exists. Separate head/tentacle helper entities are excluded. Disabling segment tracking leaves the main storms visible.

BlueMap reloads reinstall assets and rebuild the layer. Clean shutdown publishes an empty feed. The browser removes markers when the feed fails or has been unchanged for more than 15 seconds, preventing indefinite stale positions after a crash. Other addons' marker layers are left intact.

## Build and tests

Use a **JDK 17**, not a Java 8 runtime:

```powershell
$env:JAVA_HOME = 'C:\path\to\jdk-17'
.\gradlew.bat build
```

The Gradle wrapper downloads dependencies and produces the reobfuscated server JAR in `build/libs`. Wither Storm and BlueMap themselves are not bundled. Entity matching uses the verified registry IDs `witherstormmod:wither_storm` and `witherstormmod:wither_storm_segment`, avoiding a dependency on the storm mod's internal Java classes.

Java tests cover multiple storms/maps, dimension transfer, removal, reloads, layer isolation, missing maps, and safe JSON names. Web tests use actual BlueMap marker classes in a DOM harness to check native animation, UUID identity, safe names, stale-feed handling, and coexistence with BlueMap's normal marker refresh.

To reproduce web tests with Node.js 20 or newer:

```powershell
git clone --depth 1 --branch v5.3 https://github.com/BlueMap-Minecraft/BlueMap.git .dev/BlueMap
npm ci
npm test

git clone --depth 1 --branch v5.12 https://github.com/BlueMap-Minecraft/BlueMap.git .dev/BlueMap-5.12
$env:BLUEMAP_SOURCE = '.dev/BlueMap-5.12'
npm test
```

**Validation boundary:** the compiled Java/API tests and native-class web tests pass. A dedicated-server gameplay test with the full KNCraft pack has not been performed. Use the [server smoke-test checklist](docs/SERVER-TEST.md) when the side-server is ready.

## Artwork and credits

`src/main/resources/web/storm.png` is the unchanged `wither_storm_mod_logo.png` from the locally installed Wither Storm 4.2.1 JAR. It depicts the mod's black storm head, purple eye, and pale teeth, with the original purple background. The artwork belongs to the [Cracker's Wither Storm Mod team](https://www.curseforge.com/minecraft/mc-mods/crackers-wither-storm-mod); its rights are retained by its creators. BlueMap is by [Blue / Lukas Rieger and contributors](https://github.com/BlueMap-Minecraft/BlueMap).

A transparent-cutout experiment using the built-in image generator was discarded because it produced opaque checkerboard pixels. The shipped icon uses the original artwork, with no generated pixels.
