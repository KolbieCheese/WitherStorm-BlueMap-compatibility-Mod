package net.kncraft.witherstormbluemap;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import de.bluecolored.bluemap.api.*;
import de.bluecolored.bluemap.api.markers.MarkerSet;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BlueMapBridgeTest {
    @TempDir Path root;
    BlueMapAPI api;
    BlueMapBridge bridge;
    BlueMapMap overworld, cave, nether;
    final Object world = new Object(), otherWorld = new Object();
    final UUID first = UUID.randomUUID(), second = UUID.randomUUID();

    @BeforeEach void setUp() {
        api = mock(BlueMapAPI.class);
        WebApp web = mock(WebApp.class);
        when(api.getWebApp()).thenReturn(web);
        when(web.getWebRoot()).thenReturn(root);
        overworld = map("overworld"); cave = map("cave"); nether = map("nether");
        when(api.getMaps()).thenReturn(List.of(overworld, cave, nether));
        BlueMapWorld normal = mock(BlueMapWorld.class), other = mock(BlueMapWorld.class);
        when(normal.getMaps()).thenReturn(List.of(overworld, cave));
        when(other.getMaps()).thenReturn(List.of(nether));
        when(api.getWorld(world)).thenReturn(Optional.of(normal));
        when(api.getWorld(otherWorld)).thenReturn(Optional.of(other));
        bridge = new BlueMapBridge();
        bridge.enable(api);
        assertTrue(bridge.isReady());
    }

    @AfterEach void tearDown() { bridge.close(); }

    BlueMapMap map(String id) {
        BlueMapMap map = mock(BlueMapMap.class);
        when(map.getId()).thenReturn(id);
        when(map.getMarkerSets()).thenReturn(new ConcurrentHashMap<>());
        return map;
    }

    StormSnapshot storm(UUID id, Object dimension, double x) {
        return new StormSnapshot(id, dimension, "example:dimension", "Wither Storm", x, 80, -20, false, 4, false);
    }

    JsonObject feed() throws Exception {
        bridge.flush();
        return JsonParser.parseString(Files.readString(root.resolve("witherstorm-bluemap/live.json"))).getAsJsonObject();
    }

    @Test void multipleStormsAppearOnEveryMapOfTheirWorld() throws Exception {
        bridge.update(List.of(storm(first, world, 10), storm(second, world, 30)), false);
        var maps = feed().getAsJsonObject("maps");
        assertEquals(2, maps.getAsJsonArray("overworld").size());
        assertEquals(2, maps.getAsJsonArray("cave").size());
        assertEquals(0, maps.getAsJsonArray("nether").size());
        assertNotEquals(maps.getAsJsonArray("overworld").get(0).getAsJsonObject().get("uuid"),
                maps.getAsJsonArray("overworld").get(1).getAsJsonObject().get("uuid"));
    }

    @Test void movementTransferAndRemovalReplaceOldPositions() throws Exception {
        bridge.update(List.of(storm(first, world, 10), storm(second, world, 30)), false);
        bridge.update(List.of(storm(first, otherWorld, -400)), false);
        var maps = feed().getAsJsonObject("maps");
        assertEquals(0, maps.getAsJsonArray("overworld").size());
        var moved = maps.getAsJsonArray("nether").get(0).getAsJsonObject();
        assertEquals(first.toString(), moved.get("uuid").getAsString());
        assertEquals(-400, moved.getAsJsonObject("position").get("x").getAsDouble());
        bridge.update(List.of(), false);
        assertEquals(0, feed().getAsJsonObject("maps").getAsJsonArray("nether").size());
    }

    @Test void disableClearsOnlyOwnedLayerAndReloadReinstallsAssets() throws Exception {
        MarkerSet unrelated = new MarkerSet("Homes");
        overworld.getMarkerSets().put("homes", unrelated);
        bridge.update(List.of(storm(first, world, 10)), true);
        assertTrue(overworld.getMarkerSets().get(BlueMapBridge.SET_ID).isDefaultHidden());
        bridge.disable(api);
        assertFalse(bridge.isReady());
        assertEquals(Map.of("homes", unrelated), overworld.getMarkerSets());
        assertTrue(feed().getAsJsonObject("maps").entrySet().isEmpty());
        bridge.enable(api);
        bridge.update(List.of(storm(first, world, 20)), false);
        assertEquals(1, feed().getAsJsonObject("maps").getAsJsonArray("overworld").size());
        verify(api.getWebApp(), times(2)).registerScript("witherstorm-bluemap/storms.js?v=" + BuildVersion.VERSION);
        verify(api.getWebApp(), times(2)).registerStyle("witherstorm-bluemap/storms.css?v=" + BuildVersion.VERSION);
        assertTrue(Files.size(root.resolve("witherstorm-bluemap/storm.png")) > 0);
        assertTrue(Files.size(root.resolve("witherstorm-bluemap/wither.png")) > 0);
    }

    @Test void unmappedWorldIsSkippedAndNamesRoundTripAsData() throws Exception {
        Object missing = new Object();
        when(api.getWorld(missing)).thenReturn(Optional.empty());
        String name = "<img src=x onerror=alert(1)> & \"storm\"";
        bridge.update(List.of(storm(first, missing, 1),
                new StormSnapshot(second, world, "minecraft:overworld", name, 0, 64, 0, true, 6, true)), false);
        var entries = feed().getAsJsonObject("maps").getAsJsonArray("overworld");
        assertEquals(1, entries.size());
        assertTrue(entries.get(0).getAsJsonObject().get("name").getAsString().startsWith(name + " (segment)"));
    }

    @Test void phasesAndHeadStatesUpdateIndependentlyForStormsAndSegments() throws Exception {
        bridge.update(List.of(storm(first, world, 10),
                new StormSnapshot(second, world, "minecraft:overworld", "Segment", 20, 64, 0, true, 6, true)), false);
        var entries = feed().getAsJsonObject("maps").getAsJsonArray("overworld");
        assertEquals(4, entries.get(0).getAsJsonObject().get("phase").getAsInt());
        assertFalse(entries.get(0).getAsJsonObject().get("otherHeadsDisabled").getAsBoolean());
        assertEquals(6, entries.get(1).getAsJsonObject().get("phase").getAsInt());
        assertTrue(entries.get(1).getAsJsonObject().get("otherHeadsDisabled").getAsBoolean());
        bridge.update(List.of(new StormSnapshot(second, world, "minecraft:overworld", "Segment", 20, 64, 0, true, 7, false)), false);
        var evolved = feed().getAsJsonObject("maps").getAsJsonArray("overworld").get(0).getAsJsonObject();
        assertEquals(second.toString(), evolved.get("uuid").getAsString());
        assertEquals(7, evolved.get("phase").getAsInt());
        assertFalse(evolved.get("otherHeadsDisabled").getAsBoolean());
    }

    @Test void bundledHeadsHaveRealTransparentBackgrounds() throws Exception {
        for (String asset : List.of("storm.png", "wither.png")) {
            var icon = javax.imageio.ImageIO.read(root.resolve("witherstorm-bluemap/" + asset).toFile());
            assertNotNull(icon, asset);
            assertTrue(icon.getColorModel().hasAlpha(), asset + " must contain real alpha, not a drawn checkerboard");
            int transparent = 0, opaque = 0;
            for (int y = 0; y < icon.getHeight(); y++) {
                for (int x = 0; x < icon.getWidth(); x++) {
                    int alpha = icon.getRGB(x, y) >>> 24;
                    if (alpha == 0) transparent++;
                    if (alpha == 255) opaque++;
                }
            }
            int area = icon.getWidth() * icon.getHeight();
            assertTrue(transparent > area / 10, asset + " needs transparent space outside the head");
            assertTrue(opaque > area / 10, asset + " must retain the head");
            assertEquals(0, icon.getRGB(0, 0) >>> 24, asset);
            assertEquals(0, icon.getRGB(icon.getWidth() - 1, icon.getHeight() - 1) >>> 24, asset);
        }
    }
}
