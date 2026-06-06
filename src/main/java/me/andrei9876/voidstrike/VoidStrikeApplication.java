package me.andrei9876.voidstrike;

import me.andrei9876.voidstrike.config.GameProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(GameProperties.class)
public class VoidStrikeApplication {

    public static void main(String[] args) {
        SpringApplication.run(VoidStrikeApplication.class, args);
    }

}
