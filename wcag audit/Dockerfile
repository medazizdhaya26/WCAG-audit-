# ── Build (Vite) ───────────────────────────────────────
FROM node:20 AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Les URLs des services sont injectées au build via des ARG → VITE_*
ARG VITE_CRAWLER_URL
ARG VITE_AUDIT_URL
ARG VITE_REPORT_URL
ARG VITE_USER_URL
ARG VITE_KEYCLOAK_URL
ENV VITE_CRAWLER_URL=$VITE_CRAWLER_URL \
    VITE_AUDIT_URL=$VITE_AUDIT_URL \
    VITE_REPORT_URL=$VITE_REPORT_URL \
    VITE_USER_URL=$VITE_USER_URL \
    VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL
RUN npm run build

# ── Runtime (Nginx) ────────────────────────────────────
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
