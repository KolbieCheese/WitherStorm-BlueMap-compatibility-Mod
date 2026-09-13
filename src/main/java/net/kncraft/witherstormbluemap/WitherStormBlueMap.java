package net.kncraft.witherstormbluemap;

import com.mojang.logging.LogUtils;
import de.bluecolored.bluemap.api.BlueMapAPI;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraftforge.common.ForgeConfigSpec;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.event.RegisterCommandsEvent;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.event.entity.EntityJoinLevelEvent;
import net.minecraftforge.event.entity.EntityLeaveLevelEvent;
import net.minecraftforge.event.server.ServerStartedEvent;
import net.minecraftforge.event.server.ServerAboutToStartEvent;
import net.minecraftforge.event.server.ServerStoppingEvent;
import net.minecraftforge.fml.ModLoadingContext;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.config.ModConfig;
import net.minecraftforge.registries.ForgeRegistries;
import org.slf4j.Logger;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;

@Mod(WitherStormBlueMap.MOD_ID)
public final class WitherStormBlueMap {
    public static final String MOD_ID = "witherstormbluemap";
    private static final Logger LOGGER = LogUtils.getLogger();
    private static final ResourceLocation STORM = new ResourceLocation("witherstormmod", "wither_storm");
    private static final ResourceLocation SEGMENT = new ResourceLocation("witherstormmod", "wither_storm_segment");
    private static final ForgeConfigSpec SPEC;
    private static final ForgeConfigSpec.IntValue UPDATE_TICKS;
    private static final ForgeConfigSpec.BooleanValue SEGMENTS;
    private static final ForgeConfigSpec.BooleanValue HIDDEN;

    static {
        ForgeConfigSpec.Builder builder = new ForgeConfigSpec.Builder();
        UPDATE_TICKS = builder.comment("Position sampling interval in server ticks (20 ticks = 1 second at 20 TPS).",
                "The browser polls the live feed every second, like BlueMap players.")
                .defineInRange("updateIntervalTicks", 20, 1, 200);
        SEGMENTS = builder.comment("Also show the independently moving Wither Storm segments.")
                .define("showSegments", true);
        HIDDEN = builder.comment("Hide the Wither Storms layer by default; viewers can toggle it on.")
                .define("defaultHidden", false);
        SPEC = builder.build();
    }

    // Accessed only on the server thread. Events avoid scanning all entities every update.
    private final Map<UUID, Entity> tracked = new HashMap<>();
    private BlueMapBridge bridge;
    private Consumer<BlueMapAPI> enableListener;
    private Consumer<BlueMapAPI> disableListener;
    private int ticks;
    private boolean updateFailed;

    public WitherStormBlueMap() {
        ModLoadingContext.get().registerConfig(ModConfig.Type.SERVER, SPEC);
        MinecraftForge.EVENT_BUS.addListener(this::start);
        MinecraftForge.EVENT_BUS.addListener(this::prepare);
        MinecraftForge.EVENT_BUS.addListener(this::stop);
        MinecraftForge.EVENT_BUS.addListener(this::join);
        MinecraftForge.EVENT_BUS.addListener(this::leave);
        MinecraftForge.EVENT_BUS.addListener(this::tick);
        MinecraftForge.EVENT_BUS.addListener(this::commands);
    }

    private static boolean isStorm(Entity entity) {
        ResourceLocation type = ForgeRegistries.ENTITY_TYPES.getKey(entity.getType());
        return STORM.equals(type) || SEGMENT.equals(type);
    }

    private void join(EntityJoinLevelEvent event) {
        if (!event.getLevel().isClientSide() && isStorm(event.getEntity()))
            tracked.put(event.getEntity().getUUID(), event.getEntity());
    }

    private void leave(EntityLeaveLevelEvent event) {
        if (!event.getLevel().isClientSide())
            tracked.remove(event.getEntity().getUUID(), event.getEntity());
    }

    private void start(ServerStartedEvent event) {
        tracked.clear();
        for (ServerLevel level : event.getServer().getAllLevels()) {
            for (Entity entity : level.getAllEntities()) {
                if (isStorm(entity)) tracked.put(entity.getUUID(), entity);
            }
        }
        ticks = 0;
        updateFailed = false;
        LOGGER.info("Wither Storm BlueMap started; tracking {} loaded storms/segments.", tracked.size());
    }

    private void prepare(ServerAboutToStartEvent event) {
        bridge = new BlueMapBridge();
        enableListener = bridge::enable;
        disableListener = bridge::disable;
        BlueMapAPI.onDisable(disableListener);
        BlueMapAPI.onEnable(enableListener);
    }

    private void stop(ServerStoppingEvent event) {
        if (enableListener != null) BlueMapAPI.unregisterListener(enableListener);
        if (disableListener != null) BlueMapAPI.unregisterListener(disableListener);
        if (bridge != null) bridge.close();
        bridge = null;
        enableListener = null;
        disableListener = null;
        tracked.clear();
    }

    private void tick(TickEvent.ServerTickEvent event) {
        if (event.phase != TickEvent.Phase.END || bridge == null) return;
        if (++ticks < UPDATE_TICKS.get()) return;
        ticks = 0;
        tracked.values().removeIf(Entity::isRemoved);
        var snapshots = new ArrayList<StormSnapshot>(tracked.size());
        for (Entity entity : tracked.values()) {
            boolean segment = SEGMENT.equals(ForgeRegistries.ENTITY_TYPES.getKey(entity.getType()));
            if (segment && !SEGMENTS.get()) continue;
            var appearance = StormPhaseReader.read(entity);
            // Do not filter isAlive(): the storm's temporary defeated state is still trackable.
            snapshots.add(new StormSnapshot(entity.getUUID(), entity.level(),
                    entity.level().dimension().location().toString(),
                    entity.hasCustomName() ? entity.getCustomName().getString() : "Wither Storm",
                    entity.getX(), entity.getY(), entity.getZ(), segment,
                    appearance.phase(), appearance.otherHeadsDisabled()));
        }
        try {
            bridge.update(snapshots, HIDDEN.get());
            if (updateFailed) LOGGER.info("Wither Storm BlueMap marker updates recovered.");
            updateFailed = false;
        } catch (RuntimeException exception) {
            if (!updateFailed) LOGGER.error("Could not update Wither Storm markers; will retry.", exception);
            updateFailed = true;
        }
    }

    private void commands(RegisterCommandsEvent event) {
        event.getDispatcher().register(Commands.literal("witherstormbluemap")
                .requires(source -> source.hasPermission(2))
                .then(Commands.literal("status").executes(context -> {
                    String status = "Wither Storm BlueMap: API "
                            + (bridge != null && bridge.isReady() ? "ready" : "waiting for BlueMap")
                            + "; loaded storms/segments: " + tracked.size()
                            + "; interval: " + UPDATE_TICKS.get() + " ticks"
                            + (updateFailed || bridge != null && bridge.hasWriteFailure()
                                    ? "; last update failed (see server log)" : "");
                    context.getSource().sendSuccess(() -> Component.literal(status), false);
                    return tracked.size();
                })));
    }
}
