package com.esprit.ms.getway;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
class FallbackController {
    @GetMapping("/fallback/avis")
    public ResponseEntity<String> avisFallback() {
        return ResponseEntity.status(503).body("AVIS service temporarily unavailable");
    }
}
