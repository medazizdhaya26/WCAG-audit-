# Déploiement WEB4ALL sur AWS EC2

Guide pas-à-pas pour héberger **tout** le projet (frontend + backend + bases + Keycloak) sur une seule instance EC2.

## 1. Créer l'instance EC2

1. Console AWS → **EC2** → **Launch instance**
2. **AMI** : Ubuntu Server 22.04 LTS
3. **Type** : `t3.medium` (2 vCPU, **4 Go RAM**) — minimum à cause de Chromium + Keycloak. `t3.large` (8 Go) si tu peux.
4. **Key pair** : crée-en une (`.pem`) et garde-la.
5. **Storage** : 30 Go
6. **Security group** — ouvre ces ports (Inbound rules, source `0.0.0.0/0`) :

   | Port | Service |
   |------|---------|
   | 22   | SSH |
   | 80   | Frontend |
   | 3001 | report-service |
   | 3002 | crawler-service |
   | 3005 | audit-service |
   | 8081 | Keycloak |
   | 8100 | userService |

7. Lance l'instance et note son **IP publique** (ex: `13.37.10.20`).

## 2. Se connecter et installer Docker

```bash
ssh -i ma-cle.pem ubuntu@<IP_EC2>

# Docker + Compose
sudo apt update && sudo apt install -y docker.io docker-compose-plugin git
sudo usermod -aG docker ubuntu
newgrp docker
```

## 3. Récupérer le projet

```bash
git clone <URL_DE_TON_REPO> web4all
cd web4all
```

## 4. Lancer tout le stack

```bash
export EC2_IP=<IP_EC2>          # ex: export EC2_IP=13.37.10.20
docker compose -f docker-compose.prod.yml up -d --build
```

Le premier build prend ~10-15 min (Playwright, Maven, Vite). Ensuite :

```bash
docker compose -f docker-compose.prod.yml ps      # tout doit être "Up"
docker compose -f docker-compose.prod.yml logs -f  # voir les logs
```

## 5. Accéder à l'application

- **Frontend** : `http://<IP_EC2>`
- **Keycloak admin** : `http://<IP_EC2>:8081` (admin / admin)
- Comptes de démo (realm web4all) : `demo` / `demo` · `admin-web4all` / `admin`

## 6. Vérifications utiles

```bash
# les bases user_db + keycloak sont créées auto au 1er démarrage (init-db)
docker exec web4all-postgres psql -U admin -c "\l"

# si Keycloak a démarré avant la base, redémarre-le
docker restart web4all-keycloak
```

---

## Notes importantes

- **RAM** : si l'audit plante, l'instance manque de mémoire → passe en `t3.large` (8 Go).
- **HTTPS** : pour un vrai domaine, ajoute **Nginx + Certbot** devant (Let's Encrypt). Sans domaine, on reste en HTTP (suffisant pour une démo).
- **Auth** : `AUTH_ENABLED=false` par défaut (les endpoints ne sont pas bloqués). Passe à `true` dans le compose pour exiger un JWT partout.
- **IA** : ajoute `OPENAI_API_KEY` ou `OLLAMA_MODEL` au service `report-service` pour activer le chatbot/corrections.
- **Coûts** : `t3.medium` ≈ 30$/mois — couvert par tes **crédits étudiants** (GitHub Student Pack / AWS Educate). **Arrête l'instance** quand tu ne t'en sers pas pour économiser les crédits (`Stop`, pas `Terminate`).

## Mettre à jour après un changement de code

```bash
cd web4all && git pull
docker compose -f docker-compose.prod.yml up -d --build
```
