package me.andrei9876.voidstrike;

import me.andrei9876.voidstrike.config.GameProperties;
import me.andrei9876.voidstrike.config.WorldStorageProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties({GameProperties.class, WorldStorageProperties.class})
public class VoidStrikeApplication {

    public static void main(String[] args) {
        SpringApplication.run(VoidStrikeApplication.class, args);
    }

}
