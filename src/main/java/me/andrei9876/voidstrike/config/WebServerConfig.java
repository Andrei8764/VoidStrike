package me.andrei9876.voidstrike.config;

import org.apache.catalina.connector.Connector;
import org.springframework.boot.tomcat.servlet.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class WebServerConfig {

    @Bean
    public WebServerFactoryCustomizer<TomcatServletWebServerFactory> tomcatCustomizer() {
        return factory -> factory.addConnectorCustomizers(this::tuneConnector);
    }

    private void tuneConnector(Connector connector) {
        connector.setProperty("connectionTimeout", "5000");
        connector.setProperty("keepAliveTimeout", "30000");
        connector.setProperty("maxKeepAliveRequests", "1000");
        connector.setProperty("tcpNoDelay", "true");
    }
}
