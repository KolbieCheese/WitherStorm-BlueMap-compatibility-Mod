package net.kncraft.witherstormbluemap;

import com.mojang.logging.LogUtils;
import java.lang.reflect.Method;

/** Reads the mod's public, unmapped accessors without loading any client/model classes. */
final class StormPhaseReader {
    record Appearance(int phase, boolean otherHeadsDisabled) {}
    private static final Appearance UNKNOWN = new Appearance(-1, false);
    private static final ClassValue<Accessor> ACCESSORS = new ClassValue<>() {
        @Override protected Accessor computeValue(Class<?> type) { return new Accessor(type); }
    };

    // Called only for recognized storm entities, on the Minecraft server thread.
    static Appearance read(Object storm) { return ACCESSORS.get(storm.getClass()).read(storm); }

    private static final class Accessor {
        private final Class<?> type;
        private Method phase, otherHeadsDisabled;
        private boolean warned;

        Accessor(Class<?> type) {
            this.type = type;
            try {
                phase = type.getMethod("getPhase");
                if (phase.getReturnType() != int.class) phase = null;
                otherHeadsDisabled = type.getMethod("areOtherHeadsDisabled");
                if (otherHeadsDisabled.getReturnType() != boolean.class) otherHeadsDisabled = null;
            } catch (NoSuchMethodException ignored) {
                // A missing optional head-state accessor must not discard a readable phase.
            }
        }

        Appearance read(Object storm) {
            try {
                if (phase == null) throw new ReflectiveOperationException("No public int getPhase()");
                int value = (int) phase.invoke(storm);
                if (value < 0 || value > 7) return UNKNOWN;
                boolean singleHead = value == 6;
                if (otherHeadsDisabled != null) singleHead = (boolean) otherHeadsDisabled.invoke(storm);
                return new Appearance(value, singleHead);
            } catch (ReflectiveOperationException | RuntimeException exception) {
                if (!warned) {
                    LogUtils.getLogger().warn("Could not read Wither Storm phase from {}; using the default icon", type.getName(), exception);
                    warned = true;
                }
                return UNKNOWN;
            }
        }
    }
}
