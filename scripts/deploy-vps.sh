#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/wolfcha}"
DOMAIN="${DOMAIN:-wolfcha.openhubs.xyz}"
APP_PORT="${APP_PORT:-7860}"
CERT_ZIP="${CERT_ZIP:-/home/${DOMAIN}_nginx.zip}"
CERT_DIR="${CERT_DIR:-/etc/nginx/ssl/${DOMAIN}}"
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}"
NGINX_LINK="/etc/nginx/sites-enabled/${DOMAIN}"
NGINX_CACHE_CONF="/etc/nginx/conf.d/${DOMAIN}-static-cache.conf"
NGINX_STATIC_CACHE_DIR="${NGINX_STATIC_CACHE_DIR:-/var/cache/nginx/${DOMAIN}/next-static}"
WOLFCHA_IMAGE="${WOLFCHA_IMAGE:-}"

log() {
  printf '[deploy] %s\n' "$*"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf '[deploy] missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

install_basic_packages() {
  if command -v apt-get >/dev/null 2>&1; then
    local missing=()
    for cmd in nginx unzip curl git; do
      if ! command -v "$cmd" >/dev/null 2>&1; then
        missing+=("$cmd")
      fi
    done
    if [ "${#missing[@]}" -gt 0 ]; then
      log "Installing missing packages: ${missing[*]}"
      apt-get update
      apt-get install -y "${missing[@]}"
    fi
  fi
}

login_container_registry() {
  if [ -z "${GHCR_TOKEN:-}" ]; then
    return 0
  fi

  if [ -z "${GHCR_USERNAME:-}" ]; then
    printf '[deploy] GHCR_TOKEN was provided but GHCR_USERNAME is missing\n' >&2
    exit 1
  fi

  printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin >/dev/null
  log "Logged in to ghcr.io"
}

install_certificate() {
  if [ ! -f "$CERT_ZIP" ]; then
    printf '[deploy] certificate zip not found: %s\n' "$CERT_ZIP" >&2
    exit 1
  fi

  require_command unzip

  local extract_dir
  extract_dir="$(mktemp -d)"
  unzip -oq "$CERT_ZIP" -d "$extract_dir"

  local key_file cert_file
  key_file="$(find "$extract_dir" -type f \( -iname '*.key' -o -iname '*private*.pem' -o -iname '*privkey*.pem' \) | head -n 1 || true)"
  cert_file="$(find "$extract_dir" -type f \( -iname '*bundle*.crt' -o -iname '*fullchain*.pem' -o -iname '*.pem' -o -iname '*.crt' -o -iname '*.cer' \) ! -iname '*.key' ! -iname '*private*.pem' ! -iname '*privkey*.pem' | head -n 1 || true)"

  if [ -z "$key_file" ] || [ -z "$cert_file" ]; then
    printf '[deploy] could not find cert/key files in %s\n' "$CERT_ZIP" >&2
    find "$extract_dir" -type f >&2
    exit 1
  fi

  install -d -m 700 "$CERT_DIR"
  install -m 600 "$key_file" "${CERT_DIR}/privkey.pem"
  install -m 644 "$cert_file" "${CERT_DIR}/fullchain.pem"
  rm -rf "$extract_dir"
  log "Installed TLS certificate for ${DOMAIN}"
}

write_nginx_site() {
  require_command nginx

  install -d -m 755 "$NGINX_STATIC_CACHE_DIR"
  if id www-data >/dev/null 2>&1; then
    chown www-data:www-data "$NGINX_STATIC_CACHE_DIR"
  fi

  cat > "$NGINX_CACHE_CONF" <<NGINX
map \$http_accept_encoding \$wolfcha_static_encoding {
    default "";
    "~*gzip" "gzip";
}

proxy_cache_path ${NGINX_STATIC_CACHE_DIR} levels=1:2 keys_zone=wolfcha_static:50m max_size=512m inactive=365d use_temp_path=off;
NGINX

  cat > "$NGINX_SITE" <<NGINX
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate ${CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${CERT_DIR}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    client_max_body_size 20m;

    location ^~ /_next/static/ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Accept-Encoding \$wolfcha_static_encoding;
        proxy_cache wolfcha_static;
        proxy_cache_key "\$scheme|\$request_method|\$host|\$request_uri|\$wolfcha_static_encoding";
        proxy_cache_lock on;
        proxy_cache_revalidate on;
        proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
        proxy_cache_valid 200 365d;
        proxy_cache_valid 301 302 1h;
        proxy_cache_valid 404 1m;
        proxy_ignore_headers Set-Cookie;
        proxy_hide_header Set-Cookie;
        add_header X-Wolfcha-Static-Cache \$upstream_cache_status always;
    }

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
NGINX

  ln -sfn "$NGINX_SITE" "$NGINX_LINK"
  nginx -t
  systemctl reload nginx
  log "Reloaded nginx for ${DOMAIN}"
}

warm_static_assets() {
  require_command curl

  local page_tmp
  page_tmp="$(mktemp)"

  if ! curl -fsS --compressed -H "Accept-Encoding: gzip" --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/" -o "$page_tmp"; then
    log "Static asset warmup skipped: could not fetch homepage"
    rm -f "$page_tmp"
    return 0
  fi

  local warmed=0
  local asset url
  while IFS= read -r asset; do
    [ -n "$asset" ] || continue
    url="https://${DOMAIN}${asset}"
    if curl -fsS --compressed -H "Accept-Encoding: gzip" --resolve "${DOMAIN}:443:127.0.0.1" "$url" -o /dev/null; then
      warmed=$((warmed + 1))
    else
      log "Static asset warmup missed: ${asset}"
    fi
  done < <(grep -oE '"/_next/static/[^"]+\.(js|css)"' "$page_tmp" | tr -d '"' | sort -u)

  rm -f "$page_tmp"
  log "Warmed ${warmed} Next static assets"
}

start_application() {
  require_command docker

  cd "$APP_DIR"
  if [ ! -f .env.production ]; then
    printf '[deploy] missing %s/.env.production\n' "$APP_DIR" >&2
    exit 1
  fi

  if [ -n "$WOLFCHA_IMAGE" ]; then
    export WOLFCHA_IMAGE
    login_container_registry
    docker compose --env-file .env.production pull app
  else
    nice -n 10 docker compose --env-file .env.production build app
  fi

  docker compose --env-file .env.production run --rm --no-deps app node scripts/migrate-postgres.mjs
  docker compose --env-file .env.production up -d --no-build --remove-orphans app

  log "Started Docker Compose service"
}

wait_for_health() {
  require_command curl

  local url="http://127.0.0.1:${APP_PORT}/api/health"
  for _ in $(seq 1 30); do
    if curl -fsS "$url" >/dev/null; then
      log "Health check passed"
      return 0
    fi
    sleep 2
  done

  docker compose --env-file .env.production ps || true
  docker compose --env-file .env.production logs --tail=120 app || true
  printf '[deploy] health check failed: %s\n' "$url" >&2
  exit 1
}

main() {
  install_basic_packages
  install_certificate
  start_application
  wait_for_health
  write_nginx_site
  warm_static_assets
}

main "$@"
