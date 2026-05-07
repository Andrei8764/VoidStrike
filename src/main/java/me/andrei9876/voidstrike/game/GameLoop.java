package me.andrei9876.voidstrike.game;

import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@Component
public class GameLoop {

    private static final int TICKS_PER_SECOND = 30;
    private static final double DELTA_SECONDS = 1.0 / TICKS_PER_SECOND;

    private final GameRoomManager gameRoomManager;
    private ScheduledExecutorService executorService;

    public GameLoop(GameRoomManager gameRoomManager) {
        this.gameRoomManager = gameRoomManager;
    }

    @PostConstruct
    public void start() {
        executorService = Executors.newSingleThreadScheduledExecutor();

        executorService.scheduleAtFixedRate(
                this::tick,
                0,
                1000 / TICKS_PER_SECOND,
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
            room.tick(DELTA_SECONDS);
        }
    }
}