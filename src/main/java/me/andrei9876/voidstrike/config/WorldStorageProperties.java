package me.andrei9876.voidstrike.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.file.Path;

@ConfigurationProperties(prefix = "app.world")
public class WorldStorageProperties {

    /**
     * Runtime-editable world files live outside the packaged JAR.
     */
    private Path dataDir = Path.of("data/world");

    public Path getDataDir() {
        return dataDir;
    }

    public void setDataDir(Path dataDir) {
        this.dataDir = dataDir;
    }
}
