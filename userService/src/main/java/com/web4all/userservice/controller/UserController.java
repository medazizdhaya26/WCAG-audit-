package com.web4all.userservice.controller;

import com.web4all.userservice.entity.UserProfile;
import com.web4all.userservice.repository.UserProfileRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserProfileRepository repo;

    public UserController(UserProfileRepository repo) {
        this.repo = repo;
    }

    /** Profil de l'utilisateur courant — auto-créé au premier appel à partir du JWT Keycloak. */
    @GetMapping("/me")
    public UserProfile me(@AuthenticationPrincipal Jwt jwt) {
        return repo.findByKeycloakId(jwt.getSubject()).orElseGet(() -> {
            UserProfile u = new UserProfile();
            u.setKeycloakId(jwt.getSubject());
            u.setUsername(jwt.getClaimAsString("preferred_username"));
            u.setEmail(jwt.getClaimAsString("email"));
            u.setFullName(jwt.getClaimAsString("name"));
            u.setCreatedAt(Instant.now());
            return repo.save(u);
        });
    }

    /** Met à jour le profil (nom complet). */
    @PutMapping("/me")
    public UserProfile update(@AuthenticationPrincipal Jwt jwt, @RequestBody Map<String, String> body) {
        UserProfile u = me(jwt);
        if (body.containsKey("fullName")) u.setFullName(body.get("fullName"));
        u.setUpdatedAt(Instant.now());
        return repo.save(u);
    }

    /** Incrémente le compteur d'audits (appelé après le lancement d'un audit). */
    @PostMapping("/me/audits/increment")
    public UserProfile incrementAudits(@AuthenticationPrincipal Jwt jwt) {
        UserProfile u = me(jwt);
        u.setAuditsCount(u.getAuditsCount() + 1);
        return repo.save(u);
    }

    /** Liste des utilisateurs (réservé ADMIN). */
    @GetMapping
    public ResponseEntity<List<UserProfile>> all(@AuthenticationPrincipal Jwt jwt) {
        var roles = jwt.getClaimAsMap("realm_access");
        boolean isAdmin = roles != null && String.valueOf(roles.get("roles")).contains("ADMIN");
        if (!isAdmin) return ResponseEntity.status(403).build();
        return ResponseEntity.ok(repo.findAll());
    }
}
