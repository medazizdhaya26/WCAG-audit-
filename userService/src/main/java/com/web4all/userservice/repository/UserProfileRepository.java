package com.web4all.userservice.repository;

import com.web4all.userservice.entity.UserProfile;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface UserProfileRepository extends JpaRepository<UserProfile, String> {
    Optional<UserProfile> findByKeycloakId(String keycloakId);
}
