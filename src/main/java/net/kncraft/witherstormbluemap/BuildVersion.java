package net.kncraft.witherstormbluemap;

import java.io.IOException;
import java.util.Properties;

/** Build-time version shared by Forge metadata, release naming, and browser cache busting. */
final class BuildVersion {
    static final String VERSION = read();

    private static String read() {
        try (var input = BuildVersion.class.getResourceAsStream("/witherstormbluemap-version.properties")) {
            if (input == null) throw new IllegalStateException("Missing build version resource");
            Properties properties = new Properties();
            properties.load(input);
            String version = properties.getProperty("version", "");
            if (!version.matches("1\\.(0|[1-9][0-9]*)"))
                throw new IllegalStateException("Invalid build version: " + version);
            return version;
        } catch (IOException exception) {
            throw new IllegalStateException("Could not read build version", exception);
        }
    }

    private BuildVersion() {}
}
