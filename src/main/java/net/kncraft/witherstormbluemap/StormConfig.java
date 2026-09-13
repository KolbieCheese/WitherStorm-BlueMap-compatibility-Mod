package net.kncraft.witherstormbluemap;

import net.minecraftforge.common.ForgeConfigSpec;
import java.util.LinkedHashMap;
import java.util.Map;

final class StormConfig {
    static final StormConfig SERVER = new StormConfig();
    final ForgeConfigSpec spec;
    final ForgeConfigSpec.IntValue updateTicks;
    final ForgeConfigSpec.BooleanValue showSegments, defaultHidden;
    private final ForgeConfigSpec.IntValue sizePixels;
    private final ForgeConfigSpec.DoubleValue zoomScaleFactor;
    private final ForgeConfigSpec.BooleanValue scaleWithZoom, showPhaseNumber, showHoverLabel,
            showPhaseInLabel, showSideHeads;
    private final ForgeConfigSpec.ConfigValue<String> customIcon;
    private final Map<String, ForgeConfigSpec.ConfigValue<String>> phaseIcons = new LinkedHashMap<>();

    StormConfig() {
        var builder = new ForgeConfigSpec.Builder();
        updateTicks = builder.comment("Position/phase sampling interval in server ticks (20 = 1 second at 20 TPS).",
                "The browser polls every second, like BlueMap players.")
                .defineInRange("updateIntervalTicks", 20, 1, 200);
        showSegments = builder.comment("Also show independently moving Wither Storm segments.")
                .define("showSegments", true);
        defaultHidden = builder.comment("Hide the Wither Storms layer initially; viewers can toggle it on.")
                .define("defaultHidden", false);

        builder.comment("Appearance of all Wither Storm markers.").push("icons");
        sizePixels = builder.comment("Icon frame size in CSS pixels nearby, or at all distances when scaling is disabled.")
                .defineInRange("sizePixels", 40, 8, 256);
        scaleWithZoom = builder.comment("Shrink/grow icons at BlueMap's native medium/far player-marker distances (over 1000 blocks).")
                .define("scaleWithZoom", true);
        zoomScaleFactor = builder.comment("Multiplier on sizePixels when zoomed out. 0.5 halves the size; 1.0 leaves it unchanged.",
                "Only used when scaleWithZoom is true. This is the native distance-step behavior, not continuous scaling.")
                .defineInRange("zoomScaleFactor", 0.5, 0.05, 4.0);
        showPhaseNumber = builder.comment("Show the small phase number beside the icon.")
                .define("showPhaseNumber", true);
        showHoverLabel = builder.comment("Show the native name label and hover tooltip. Marker-list names remain available.")
                .define("showHoverLabel", true);
        showPhaseInLabel = builder.comment("Include [Phase X] in visible names and marker-list entries.")
                .define("showPhaseInLabel", true);
        showSideHeads = builder.comment("Show side heads in the bundled phase designs; false shows only the main head.",
                "Custom images always replace the entire head arrangement.")
                .define("showSideHeads", true);
        customIcon = source(builder, "customIcon",
                "Optional image for all phases. Empty uses bundled phase designs. Phase-specific images override this.");
        builder.comment("Optional complete icon for each main phase. Empty falls back to customIcon, then bundled artwork.")
                .push("phaseIcons");
        for (int phase = 0; phase <= 7; phase++) {
            String key = "phase" + phase;
            phaseIcons.put(key, source(builder, key, "Optional image for phase " + phase + "."));
        }
        builder.pop(2);
        spec = builder.build();
    }

    private static ForgeConfigSpec.ConfigValue<String> source(ForgeConfigSpec.Builder builder, String key, String comment) {
        return builder.comment(comment,
                "Use an HTTP(S) image URL or a path relative to the BlueMap web root, e.g. custom/my-storm.png.",
                "The image must be served to browsers; a server filesystem path does not work. Blank restores the default.")
                .define(key, "", value -> value instanceof String text && text.length() <= 2048
                        && !text.contains("\n") && !text.contains("\r"));
    }

    IconSettings icons() {
        var sources = new LinkedHashMap<String, String>();
        phaseIcons.forEach((key, value) -> {
            String source = value.get().trim();
            if (!source.isEmpty()) sources.put(key, source);
        });
        return new IconSettings(sizePixels.get(), scaleWithZoom.get(), zoomScaleFactor.get(),
                showPhaseNumber.get(), showHoverLabel.get(), showPhaseInLabel.get(), showSideHeads.get(),
                customIcon.get().trim(), sources);
    }
}
