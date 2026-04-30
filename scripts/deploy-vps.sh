#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/wolfcha}"
DOMAIN="${DOMAIN:-wolfcha.openhubs.xyz}"
APP_PORT="${APP_PORT:-7860}"
CERT_ZIP="${CERT_ZIP:-/home/${DOMAIN}_nginx.zip}"
CERT_DIR="${CERT_DIR:-/etc/nginx/ssl/${DOMAIN}}"
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}"
NGINX_LINK="/etc/nginx/sites-enabled/${DOMAIN}"

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

start_application() {
  require_command docker

  cd "$APP_DIR"
  if [ ! -f .env.production ]; then
    printf '[deploy] missing %s/.env.production\n' "$APP_DIR" >&2
    exit 1
  fi

  docker compose --env-file .env.production up -d --build --remove-orphans
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

  docker compose ps || true
  docker compose logs --tail=120 app || true
  printf '[deploy] health check failed: %s\n' "$url" >&2
  exit 1
}

main() {
  install_basic_packages
  install_certificate
  start_application
  wait_for_health
  write_nginx_site
}

main "$@"
