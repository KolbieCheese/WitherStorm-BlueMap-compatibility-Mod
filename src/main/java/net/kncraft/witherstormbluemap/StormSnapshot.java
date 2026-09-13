package net.kncraft.witherstormbluemap;

import java.util.UUID;

/** Immutable data captured on the Minecraft server thread. */
public record StormSnapshot(UUID id, Object world, String dimension, String name,
                            double x, double y, double z, boolean segment) {}
