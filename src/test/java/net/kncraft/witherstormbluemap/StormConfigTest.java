package net.kncraft.witherstormbluemap;

import com.electronwill.nightconfig.core.CommentedConfig;
import com.electronwill.nightconfig.toml.TomlParser;
import org.junit.jupiter.api.Test;
import java.nio.file.Files;
import java.nio.file.Path;
import static org.junit.jupiter.api.Assertions.*;

class StormConfigTest {
    @Test void upgradingAnExistingConfigKeepsItsValuesAndAddsAppearanceDefaults() {
        var values = CommentedConfig.inMemory();
        values.set("updateIntervalTicks", 10);
        values.set("showSegments", false);
        values.set("defaultHidden", true);
        var config = new StormConfig();
        config.spec.acceptConfig(values);
        assertEquals(10, config.updateTicks.get());
        assertFalse(config.showSegments.get());
        assertTrue(config.defaultHidden.get());
        assertEquals(IconSettings.DEFAULTS, config.icons());
    }

    @Test void exampleConfigLoadsAndOverridesReachSnapshotsAfterReload() throws Exception {
        try (var reader = Files.newBufferedReader(Path.of("docs/witherstormbluemap-server.toml"))) {
            var values = new TomlParser().parse(reader);
            var config = new StormConfig();
            config.spec.acceptConfig(values);
            assertEquals(IconSettings.DEFAULTS, config.icons());
            values.set("icons.sizePixels", 64);
            values.set("icons.scaleWithZoom", false);
            values.set("icons.zoomScaleFactor", 0.25);
            values.set("icons.showPhaseNumber", false);
            values.set("icons.showHoverLabel", false);
            values.set("icons.showPhaseInLabel", false);
            values.set("icons.showSideHeads", false);
            values.set("icons.customIcon", " custom/all.png ");
            values.set("icons.phaseIcons.phase7", "https://example.com/seven.png?key=abc&v=2");
            config.spec.afterReload();
            var icons = config.icons();
            assertEquals(64, icons.sizePixels());
            assertFalse(icons.scaleWithZoom());
            assertEquals(0.25, icons.zoomScaleFactor());
            assertFalse(icons.showPhaseNumber());
            assertFalse(icons.showHoverLabel());
            assertFalse(icons.showPhaseInLabel());
            assertFalse(icons.showSideHeads());
            assertEquals("custom/all.png", icons.customIcon());
            assertEquals("https://example.com/seven.png?key=abc&v=2", icons.phaseIcons().get("phase7"));
            assertEquals(1, icons.phaseIcons().size());
        }
    }

    @Test void invalidTypesAndRangesAreCorrectedByForge() {
        var values = CommentedConfig.inMemory();
        values.set("icons.sizePixels", -20);
        values.set("icons.zoomScaleFactor", "large");
        values.set("icons.scaleWithZoom", "sometimes");
        values.set("icons.customIcon", 42);
        var config = new StormConfig();
        config.spec.acceptConfig(values);
        assertTrue(config.icons().sizePixels() >= 8);
        assertEquals(0.5, config.icons().zoomScaleFactor());
        assertTrue(config.icons().scaleWithZoom());
        assertEquals("", config.icons().customIcon());
    }
}
