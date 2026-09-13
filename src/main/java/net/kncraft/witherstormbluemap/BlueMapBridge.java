package net.kncraft.witherstormbluemap;

import com.google.gson.Gson;
import com.mojang.logging.LogUtils;
import de.bluecolored.bluemap.api.BlueMapAPI;
import de.bluecolored.bluemap.api.BlueMapMap;
import de.bluecolored.bluemap.api.markers.MarkerSet;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;

/** API callbacks and publication are serialized; world access stays on the server thread. */
final class BlueMapBridge {
    static final String SET_ID = "kncraft-wither-storms";
    static final String WEB_DIR = "witherstorm-bluemap";
    private static final Gson GSON = new Gson();
    private final ScheduledExecutorService writer = Executors.newSingleThreadScheduledExecutor(task -> {
        Thread thread = new Thread(task, "witherstorm-bluemap-writer");
        thread.setDaemon(true);
        return thread;
    });
    private BlueMapAPI api;
    private Path feed;
    private String pending;
    private boolean writeFailed;

    BlueMapBridge() {
        writer.scheduleWithFixedDelay(this::flush, 100, 100, TimeUnit.MILLISECONDS);
    }

    synchronized void enable(BlueMapAPI enabled) {
        if (api != null) disable(api);
        Path directory = enabled.getWebApp().getWebRoot().resolve(WEB_DIR);
        try {
            Files.createDirectories(directory);
            for (String asset : List.of("storms.js", "storms.css", "storm.png", "wither.png")) {
                try (var input = BlueMapBridge.class.getResourceAsStream("/web/" + asset)) {
                    if (input == null) throw new IOException("Missing bundled asset: " + asset);
                    Files.copy(input, directory.resolve(asset), StandardCopyOption.REPLACE_EXISTING);
                }
            }
            feed = directory.resolve("live.json");
            atomicWrite(feed, emptyFeed());
            enabled.getWebApp().registerStyle(WEB_DIR + "/storms.css?v=" + BuildVersion.VERSION);
            enabled.getWebApp().registerScript(WEB_DIR + "/storms.js?v=" + BuildVersion.VERSION);
            api = enabled;
        } catch (IOException exception) {
            feed = null;
            LogUtils.getLogger().error("Could not install Wither Storm BlueMap web assets", exception);
        }
    }

    synchronized void disable(BlueMapAPI disabled) {
        if (api != disabled) return;
        for (BlueMapMap map : disabled.getMaps()) map.getMarkerSets().remove(SET_ID);
        pending = emptyFeed();
        flush();
        pending = null;
        feed = null;
        api = null;
    }

    synchronized void close() {
        if (api != null) disable(api);
        writer.shutdownNow();
    }

    synchronized boolean isReady() { return api != null; }

    synchronized boolean hasWriteFailure() { return writeFailed; }

    synchronized void update(List<StormSnapshot> storms, boolean defaultHidden) {
        if (api == null) return;
        Map<String, List<Map<String, Object>>> maps = new LinkedHashMap<>();
        for (BlueMapMap map : api.getMaps()) {
            maps.put(map.getId(), new ArrayList<>());
            // Reserve our layer so ordinary marker reconciliation preserves the live set.
            map.getMarkerSets().put(SET_ID, new MarkerSet("Wither Storms", true, defaultHidden));
        }
        for (StormSnapshot storm : storms) {
            api.getWorld(storm.world()).ifPresent(world -> {
                for (BlueMapMap map : world.getMaps()) {
                    var markers = maps.get(map.getId());
                    if (markers != null) markers.add(Map.of(
                            "uuid", storm.id().toString(),
                            "name", storm.name() + (storm.segment() ? " (segment)" : "")
                                    + " [" + storm.id().toString().substring(0, 8) + "]",
                            "position", Map.of("x", storm.x(), "y", storm.y(), "z", storm.z()),
                            "dimension", storm.dimension(),
                            "phase", storm.phase(),
                            "otherHeadsDisabled", storm.otherHeadsDisabled()));
                }
            });
        }
        // A single replaceable slot bounds memory if storage is slow.
        pending = GSON.toJson(Map.of("schema", 1, "generatedAt", System.currentTimeMillis(),
                "defaultHidden", defaultHidden, "maps", maps));
    }

    synchronized void flush() {
        if (pending == null || feed == null) return;
        try {
            atomicWrite(feed, pending);
            pending = null;
            if (writeFailed) LogUtils.getLogger().info("Wither Storm live-feed writes recovered.");
            writeFailed = false;
        } catch (IOException exception) {
            if (!writeFailed) LogUtils.getLogger().error("Could not write Wither Storm live feed; retrying", exception);
            writeFailed = true;
        }
    }

    private static String emptyFeed() {
        return GSON.toJson(Map.of("schema", 1, "generatedAt", System.currentTimeMillis(), "maps", Map.of()));
    }

    private static void atomicWrite(Path target, String data) throws IOException {
        Path temp = target.resolveSibling(target.getFileName() + ".tmp");
        Files.writeString(temp, data, StandardCharsets.UTF_8);
        try {
            Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (AtomicMoveNotSupportedException exception) {
            Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }
}
