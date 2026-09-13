package net.kncraft.witherstormbluemap;

import java.util.Map;

/** Immutable browser settings captured alongside the server's entity snapshots. */
record IconSettings(int sizePixels, boolean scaleWithZoom, double zoomScaleFactor,
                    boolean showPhaseNumber, boolean showHoverLabel, boolean showPhaseInLabel,
                    boolean showSideHeads, String customIcon, Map<String, String> phaseIcons) {
    static final IconSettings DEFAULTS = new IconSettings(40, true, 0.5,
            true, true, true, true, "", Map.of());

    IconSettings { phaseIcons = Map.copyOf(phaseIcons); }
}
