# Wither Storm BlueMap

A **server-side Forge 1.20.1 mod** that shows every loaded Cracker's Wither Storm on BlueMap, including multiple storms at once. Each storm uses its full entity UUID for identity, so movement and server restarts do not mix up markers.

The separate **Wither Storms** layer uses transparent head icons based on the mod's designs. Positions and phases are sampled every 20 server ticks and polled by the browser every second. Movement uses **BlueMap's own animated `PlayerMarker` class**, including its one-second easing animation. Storms remain a separate marker type and do not enter the real player list. Hover a storm to see **Wither Storm [Phase X]**; select its entry in the layer to center the map on it. Custom entity names replace "Wither Storm" when set. Full UUIDs identify storms internally, but are not included in visible labels.

By default, icons use a 40-pixel frame nearby and 20 pixels at medium/far distances, following the same distance thresholds as BlueMap's 32/16-pixel player heads. Size, zoom scaling, labels, side heads, and custom images are configurable. Both bundled head images have real PNG transparency, with a thin white silhouette outline and no square background.

| Main phase | Head display |
| --- | --- |
| 0–1 | Three ordinary dark Wither skulls |
| 2–3 | Mutated purple-eyed main head with ordinary side skulls |
| 4–5 | Three mutated heads |
| 6 | Mutated head, with side heads hidden until the entity enables them again |
| 7 | Three mutated heads |

A small number beside the heads identifies each main phase **0–7**. Stages that change the body while retaining the same heads share head artwork; the number still updates. The mod's live `areOtherHeadsDisabled()` state controls side-head visibility independently for each storm and segment. Intermediate body stages such as 5.5 and the phase-7 hole are represented by their main phase (5 or 7), not a separate fractional number. Unknown phases fall back to the single mature head without a number. Phase changes preserve the existing marker and its native movement animation.

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
2. Download `WitherStormBlueMap<version>.jar` from this repository's GitHub **Releases**, or use `build/libs/WitherStormBlueMap1.0.jar` from a local build. Put it in the server's `mods` folder alongside the compatible Forge BlueMap JAR and `witherstormmod-1.20.1-4.2.1-all.jar`. When updating, replace the old integration JAR so only one version is installed.
3. Start the server and complete [BlueMap's normal setup](https://bluemap.bluecolored.de/wiki/getting-started/Installation.html). BlueMap must be enabled and have a map configured for the storm's dimension.
4. Open BlueMap and refresh the browser once so it loads the installed extension. Enable **Wither Storms** in the map's marker menu if hidden.
5. Run `/witherstormbluemap status` as an operator, or `witherstormbluemap status` in the server console. It reports BlueMap readiness, loaded storms/segments, sampling interval, and update failures.

Install this integration on the **server only**; players do not need it in their client packs. It does not add blocks, entities, networking channels, or extra chunk tickets. The existing KNCraft installation and saved worlds have not been modified.

BlueMap's standard web server serves the extension automatically. It installs `witherstorm-bluemap/storms.js`, `storms.css`, `storm.png`, `wither.png`, and `live.json` beneath BlueMap's configured web root and registers the script and style through the API. Published versions include cache-versioned script, style, and image URLs. No manual JavaScript edits are needed. After an upgrade, restart the server and refresh the map page to load the new extension.

For an external web host, serve or continuously synchronize that directory too, including the changing `live.json`. Exclude that JSON from reverse-proxy/CDN caching. A deployment that copies only rendered tiles cannot deliver live storm positions.

## Configuration

Forge creates `<world>/serverconfig/witherstormbluemap-server.toml` on the server. Upgrading adds the new options while preserving existing valid settings. A [complete example config](docs/witherstormbluemap-server.toml) is included in this repository. The main settings are:

```toml
# 1–200 ticks; default is one second at 20 TPS.
updateIntervalTicks = 20
# Track independently moving storm segments as well as main storms.
showSegments = true
# Viewers can always toggle the Wither Storms layer.
defaultHidden = false

[icons]
# Nearby size in CSS pixels, allowed range 8–256.
sizePixels = 40
scaleWithZoom = true
# Zoomed-out size = sizePixels × this factor; allowed range 0.05–4.0.
zoomScaleFactor = 0.5
showPhaseNumber = true
showHoverLabel = true
showPhaseInLabel = true
showSideHeads = true
# Empty uses our bundled icons. Otherwise use a web path or HTTP(S) image URL.
customIcon = ""

[icons.phaseIcons]
# Optional overrides; the generated config includes phase0 through phase7.
phase4 = ""
phase7 = ""
```

Edit with the server stopped. Changing sampling frequency does not change the browser's one-second player-style polling. This is near-real-time tracking, with sampling, network, and native animation latency; it is not a 20-FPS entity stream. The terrain beneath a storm still follows BlueMap's normal rendering schedule.

`sizePixels = 64` with `zoomScaleFactor = 0.5` gives a 64px frame nearby and 32px when zoomed out. Setting `scaleWithZoom = false` keeps it at 64px at every distance. Scaling follows BlueMap's native distance step: medium/far starts beyond 1000 blocks from the camera plane, and both use the configured multiplier. It does not shrink continuously. Frame size includes the main layout; bundled side heads extend slightly past its edges.

`showPhaseNumber` controls the number beside the icon. `showHoverLabel` controls the native name label and hover tooltip; names remain in the marker menu. `showPhaseInLabel` controls the `[Phase X]` suffix. `showSideHeads = false` simplifies the bundled design to its main head. These all default to `true`, preserving the version 1.2 appearance.

Custom sources replace the **complete icon** and keep the optional phase number. Selection priority is the matching `icons.phaseIcons.phase0`–`phase7` entry, then `icons.customIcon`, then bundled phase artwork. To use a local custom image, put it somewhere served by BlueMap, for example `<BlueMap web root>/custom/my-storm.png`, and set `customIcon = "custom/my-storm.png"`. A path is relative to the map web page's base URL; a leading `/` starts at the website root. The integration never overwrites that custom directory. Full image URLs such as `https://example.com/storm.png` also work, and their query parameters are preserved. Windows filesystem paths, `file:` URLs, and `data:` URLs are unsupported. Use HTTPS images for an HTTPS map.

A missing, invalid, or failed custom source falls back to the next option, restoring the bundled head arrangement when needed. Failed URLs are not retried on every poll; refresh the map after fixing an image at the same URL, or change its URL/query to retry. Transparent PNGs or SVGs work well. Custom files and URLs are fetched by the viewer's browser and must be accessible there; the Minecraft server does not download arbitrary images.

Appearance settings travel in the live feed and update existing markers without resetting movement. After installing an updated integration JAR, restart the server and refresh BlueMap once to load the new script and stylesheet. For new worlds, a configured copy can also be placed in Forge's `defaultconfigs` directory before world creation.

### Keeping storms active when nobody is online

The [Wither Storm mod's official description](https://modrinth.com/mod/crackers-wither-storm-mod) confirms that it can load chunks without a player. However, **version 4.2.1 disables chunk loading while the entire server is empty by default**. Its `WitherStormModChunkLoader.tick()` releases its chunk tickets when the player count reaches zero unless the following option is enabled. The storm remains saved in the world, but being saved is different from remaining loaded and moving.

To keep storms active with nobody online, stop the side-server and change this existing entry in **that server world's** `<world>/serverconfig/witherstormmod-server.toml`, then restart:

```toml
[server.misc]
shouldChunkLoadWhenNoPlayers = true
```

Edit the existing `[server.misc]` section rather than adding a duplicate. This is the **Wither Storm mod's** configuration, not `witherstormbluemap-server.toml` or a client setting. Each world has its own file. All four inspected local KNCraft saves had this setting at `false`; a separately hosted server must be checked independently. Enabling it allows the storm's normal activity to continue while players are offline.

This integration samples server entities regardless of player count, and its live feed and marker layer are separate from BlueMap's player list. A stationary but loaded storm remains visible because the feed timestamp continues to update. When the storm mod unloads the entity, its live marker disappears until the entity loads again. The integration does not add its own chunk tickets or override the storm mod's gameplay setting. A host or another mod that pauses/stops the entire empty server must also allow it to keep ticking for live tracking to continue.

All BlueMap maps for a matching dimension receive the layer, even when their map IDs differ from the dimension ID. The tracker discovers already-loaded storms at server startup, then uses entity join/leave events. Removed or unloaded storms disappear on the next update; dimension transfers move them between maps. Temporary defeated states are retained while the entity exists. Separate head/tentacle helper entities are excluded. Disabling segment tracking leaves the main storms visible.

BlueMap reloads reinstall assets and rebuild the layer. Clean shutdown publishes an empty feed. The browser removes markers when the feed fails or has been unchanged for more than 15 seconds, preventing indefinite stale positions after a crash. Other addons' marker layers are left intact.

## Build and tests

Use a **JDK 17**, not a Java 8 runtime:

```powershell
$env:JAVA_HOME = 'C:\path\to\jdk-17'
.\gradlew.bat build
```

The Gradle wrapper downloads dependencies and produces the reobfuscated server JAR in `build/libs`. Wither Storm and BlueMap themselves are not bundled. Entity matching uses the verified registry IDs `witherstormmod:wither_storm` and `witherstormmod:wither_storm_segment`. Phase information is read through the storm mod's public `getPhase()` and `areOtherHeadsDisabled()` methods, with method lookup cached per entity class. These accessors were verified in the installed 4.2.1 JAR. No client model classes or full entity NBT serialization are needed. If an incompatible accessor fails, tracking continues with the default icon and a single warning per class.

Local builds default to `WitherStormBlueMap1.0.jar`. To build a specific sequential version, use `./gradlew build -PmodVersion=1.10` (or `.\gradlew.bat` on Windows). This sets the filename, Forge mod metadata, and web asset cache version together.

## Automatic GitHub releases

The [Build and release workflow](.github/workflows/build-and-release.yml) runs on branch pushes, pull requests, and manual dispatches. It runs the Java tests, both BlueMap web compatibility suites, and the release-script tests. A successful build on the repository's default branch (**currently `main`**) then publishes a GitHub Release automatically. Other branches and pull requests only build and test.

Release names, tags, and files are generated together:

| Publication | Release name | Git tag | Download |
| --- | --- | --- | --- |
| First | `WitherStormBlueMap1.0` | `v1.0` | `WitherStormBlueMap1.0.jar` |
| Next | `WitherStormBlueMap1.1` | `v1.1` | `WitherStormBlueMap1.1.jar` |
| After `1.9` | `WitherStormBlueMap1.10` | `v1.10` | `WitherStormBlueMap1.10.jar` |

The counter uses published GitHub Releases rather than workflow run numbers. It starts at `1.0` when there are no matching published releases. Published releases tagged `v1.x` / `1.x` and legacy `v1.x.0` releases are recognized. Failed builds do not consume a version. Versions increase in publication order; queued jobs run one at a time. Re-running a commit that this workflow already published skips creating a duplicate. Keep the published release history to preserve the counter.

Publishing first creates a draft, uploads the correctly named JAR, and only then makes it public. If an upload fails, **re-run that failed release job** to finish the same draft/version. A draft belonging to another commit or a conflicting existing tag stops publication with an explanation rather than overwriting it. GitHub queues up to 100 pending release jobs using its [documented `queue: max` setting](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).

No personal access token or version file edits are required. The release job requests `contents: write` using the repository's built-in `GITHUB_TOKEN`; test jobs only receive read permission. GitHub Actions must be enabled and repository/organization rules must allow the workflow to create release tags. Once these files are pushed to `main`, the first run will build and publish. You can also use **Actions → Build and release → Run workflow** on `main`.

To test just the release logic locally: `npm run test:release`. This uses a fake GitHub API and never publishes anything. The local workflow linter (actionlint 1.7.12) does not yet recognize `queue: max`; its other checks pass with only that documented new key excluded.

Java tests cover multiple storms/maps, dimension transfer, removal, reloads, layer isolation, missing maps, safe JSON names, live phase/head-state accessors, graceful fallback, real PNG transparency, config upgrades/validation, and appearance publication. Web tests use actual BlueMap marker classes in a DOM harness to check native animation, UUID identity, safe names, stale-feed handling, phase evolution, head regrowth, configurable sizing/labels, custom-image precedence/fallback, and coexistence with BlueMap's normal marker refresh. Tests using BlueMap's real player marker manager also verify that storms keep moving after the last player leaves and appear when the map is first opened with zero players online.

To reproduce web tests with Node.js 20 or newer:

```powershell
git clone --depth 1 --branch v5.3 https://github.com/BlueMap-Minecraft/BlueMap.git .dev/BlueMap
npm ci
npm test

git clone --depth 1 --branch v5.12 https://github.com/BlueMap-Minecraft/BlueMap.git .dev/BlueMap-5.12
$env:BLUEMAP_SOURCE = '.dev/BlueMap-5.12'
npm test
```

**Validation boundary:** the compiled Java/API tests and native-class web tests pass. The server owner has reported that version 1.0 works in their server. The phase-aware update still needs an in-game evolution check; automated tests do not run the full Wither Storm AI. Use the [server smoke-test checklist](docs/SERVER-TEST.md) for that check.

## Artwork and credits

`src/main/resources/web/storm.png` is an AI-assisted transparent adaptation of `wither_storm_mod_logo.png` from the locally installed Wither Storm 4.2.1 JAR. `wither.png` is an AI-assisted Wither skull illustration based on the mod team's [official phase gallery](https://modrinth.com/mod/crackers-wither-storm-mod/gallery). Local image processing removes the early skull's generated checkerboard, restores its thin silhouette outline, and prepares both assets as 256×256 RGBA PNGs. These are map illustrations, not direct renders of every in-game model. Their arrangement follows the gallery's head designs; the phase number distinguishes body-only changes.

The original artwork and Wither Storm design belong to the [Cracker's Wither Storm Mod team](https://www.curseforge.com/minecraft/mc-mods/crackers-wither-storm-mod); their rights are retained by their creators. BlueMap is by [Blue / Lukas Rieger and contributors](https://github.com/BlueMap-Minecraft/BlueMap).
