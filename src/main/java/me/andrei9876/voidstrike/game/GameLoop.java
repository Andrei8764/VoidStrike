package me.andrei9876.voidstrike.game;

import me.andrei9876.voidstrike.config.GameProperties;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@Component
public class GameLoop {

    private final GameRoomManager gameRoomManager;
    private final int ticksPerSecond;
    private final double deltaSeconds;
    private ScheduledExecutorService executorService;

    public GameLoop(GameRoomManager gameRoomManager, GameProperties gameProperties) {
        this.gameRoomManager = gameRoomManager;
        this.ticksPerSecond = Math.max(10, gameProperties.getTicksPerSecond());
        this.deltaSeconds = 1.0 / ticksPerSecond;
    }

    public int getTicksPerSecond() {
        return ticksPerSecond;
    }

    @PostConstruct
    public void start() {
        executorService = Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "voidstrike-game-loop");
            thread.setDaemon(true);
            return thread;
        });

        long tickIntervalMs = Math.max(1, 1000 / ticksPerSecond);

        executorService.scheduleAtFixedRate(
                this::tick,
                0,
                tickIntervalMs,
                TimeUnit.MILLISECONDS
        );
    }

    @PreDestroy
    public void stop() {
        if (executorService != null) {
            executorService.shutdownNow();
        }
    }

    private void tick() {
        for (GameRoom room : gameRoomManager.getRooms()) {
            room.tick(deltaSeconds);
        }
    }
}