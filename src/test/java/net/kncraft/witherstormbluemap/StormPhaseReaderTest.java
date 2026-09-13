package net.kncraft.witherstormbluemap;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class StormPhaseReaderTest {
    public static class Storm {
        int phase;
        boolean disabled;
        public int getPhase() { return phase; }
        public boolean areOtherHeadsDisabled() { return disabled; }
    }
    public static class Segment extends Storm {}
    public static class PhaseOnly { public int getPhase() { return 6; } }
    public static class Broken { public int getPhase() { throw new IllegalStateException("Unavailable"); } }

    @Test void readsAllMainPhasesFreshFromEachEntity() {
        var first = new Storm();
        var second = new Storm();
        second.phase = 7;
        for (int phase = 0; phase <= 7; phase++) {
            first.phase = phase;
            assertEquals(phase, StormPhaseReader.read(first).phase());
            assertEquals(7, StormPhaseReader.read(second).phase());
        }
    }

    @Test void inheritedSegmentAccessorsTrackRegrowingHeads() {
        var segment = new Segment();
        segment.phase = 6;
        segment.disabled = true;
        assertTrue(StormPhaseReader.read(segment).otherHeadsDisabled());
        segment.disabled = false;
        assertFalse(StormPhaseReader.read(segment).otherHeadsDisabled());
        assertEquals(6, StormPhaseReader.read(segment).phase());
    }

    @Test void missingHeadAccessorKeepsPhaseAndUsesSingleHeadForPhaseSix() {
        assertEquals(new StormPhaseReader.Appearance(6, true), StormPhaseReader.read(new PhaseOnly()));
    }

    @Test void unsupportedOrBrokenAccessorsFallBackWithoutBreakingTracking() {
        assertEquals(-1, StormPhaseReader.read(new Object()).phase());
        assertEquals(-1, StormPhaseReader.read(new Broken()).phase());
        var storm = new Storm();
        for (int value : new int[]{-1, 8, Integer.MAX_VALUE}) {
            storm.phase = value;
            assertEquals(-1, StormPhaseReader.read(storm).phase());
        }
    }
}
