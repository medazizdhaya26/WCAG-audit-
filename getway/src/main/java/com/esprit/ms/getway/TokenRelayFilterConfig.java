package com.esprit.ms.getway;

import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;

@Configuration
public class TokenRelayFilterConfig {

    @Bean
    public GlobalFilter tokenRelayFilter() {
        return (exchange, chain) ->
                ReactiveSecurityContextHolder.getContext()
                        .map(ctx -> ctx.getAuthentication())
                        .filter(Authentication::isAuthenticated)
                        .flatMap(auth -> {
                            Jwt jwt = (Jwt) auth.getPrincipal();
                            String token = jwt.getTokenValue();

                            return chain.filter(exchange.mutate()
                                    .request(r -> r.headers(headers ->
                                            headers.setBearerAuth(token)
                                    ))
                                    .build());
                        })
                        .switchIfEmpty(chain.filter(exchange));
    }
}