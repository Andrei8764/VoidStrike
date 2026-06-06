package me.andrei9876.voidstrike.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.game")
public class GameProperties {

    private int ticksPerSecond = 30;
    private int websocketSendTimeLimitMs = 15;
    private int websocketSendBufferSizeBytes = 512 * 1024;

    public int getTicksPerSecond() {
        return ticksPerSecond;
    }

    public void setTicksPerSecond(int ticksPerSecond) {
        this.ticksPerSecond = ticksPerSecond;
    }

    public int getWebsocketSendTimeLimitMs() {
        return websocketSendTimeLimitMs;
    }

    public void setWebsocketSendTimeLimitMs(int websocketSendTimeLimitMs) {
        this.websocketSendTimeLimitMs = websocketSendTimeLimitMs;
    }

    public int getWebsocketSendBufferSizeBytes() {
        return websocketSendBufferSizeBytes;
    }

    public void setWebsocketSendBufferSizeBytes(int websocketSendBufferSizeBytes) {
        this.websocketSendBufferSizeBytes = websocketSendBufferSizeBytes;
    }
}
