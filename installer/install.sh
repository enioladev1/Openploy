#!/usr/bin/env bash
# Openploy self-host installer. Run as root on a fresh Linux VPS:
#   curl -fsSL https://raw.githubusercontent.com/enioladev1/Openploy/main/installer/install.sh | bash
#
# Does NOT create the first admin account - that happens on first visit to
# the dashboard URL printed at the end (sign-up form, works only once).

set -euo pipefail

OPENPLOY_HOME="/etc/openploy"
STACK_NAME="openploy"
NETWORK_NAME="platform_internal"
# Not available on disk when run via `curl | bash`, so fetched below instead.
RELEASE_BASE_URL="${OPENPLOY_RELEASE_BASE_URL:-https://raw.githubusercontent.com/enioladev1/Openploy/main/installer}"
SCRIPT_DIR="${OPENPLOY_HOME}/installer"

log() { echo "[openploy-install] $*"; }
fail() { echo "[openploy-install] ERROR: $*" >&2; exit 1; }

# --- Preflight -----------------------------------------------------------

if [[ "$(id -u)" -ne 0 ]]; then
  fail "must be run as root (or with sudo)"
fi

if [[ "$(uname -s)" != "Linux" ]]; then
  fail "this installer only supports Linux hosts"
fi

log "Detecting this server's public IP..."
PLATFORM_PUBLIC_IP="$(curl -fsSL -4 https://ifconfig.me || hostname -I | awk '{print $1}')"
[[ -n "$PLATFORM_PUBLIC_IP" ]] || fail "couldn't detect this server's public IP"
export PLATFORM_PUBLIC_IP

# Instant nip.io domain - no DNS setup needed to reach the dashboard right away.
OPENPLOY_DOMAIN="dashboard-$(openssl rand -hex 3)-${PLATFORM_PUBLIC_IP//./-}.nip.io"
APP_BASE_URL="https://${OPENPLOY_DOMAIN}"
export APP_BASE_URL

mkdir -p "$OPENPLOY_HOME"

# --- Fetch companion files ----------------------------------------------------

SOURCE_PATH="${BASH_SOURCE[0]:-}"
if [[ -n "$SOURCE_PATH" && "$SOURCE_PATH" != "bash" && -e "$SOURCE_PATH" && -f "$(dirname "$SOURCE_PATH")/stack.yml" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "$SOURCE_PATH")" && pwd)"
  log "Using local installer files from ${SCRIPT_DIR}"
else
  log "Fetching installer files from ${RELEASE_BASE_URL}..."
  mkdir -p "${SCRIPT_DIR}/traefik"
  curl -fsSL "${RELEASE_BASE_URL}/stack.yml" -o "${SCRIPT_DIR}/stack.yml"
  curl -fsSL "${RELEASE_BASE_URL}/traefik/traefik.yml" -o "${SCRIPT_DIR}/traefik/traefik.yml"
fi

# --- Docker ----------------------------------------------------------------

if ! command -v docker >/dev/null 2>&1; then
  log "Docker not found, installing via get.docker.com..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
else
  log "Docker already installed ($(docker --version))"
fi

# --- Swarm + network ---------------------------------------------------------

if [[ "$(docker info --format '{{.Swarm.LocalNodeState}}')" == "active" ]]; then
  log "Already part of a Swarm"
else
  log "Initializing Swarm (advertise-addr ${PLATFORM_PUBLIC_IP})..."
  docker swarm init --advertise-addr "$PLATFORM_PUBLIC_IP"
fi

if ! docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
  log "Creating overlay network ${NETWORK_NAME}..."
  # --attachable: standalone `docker run` (migrations, platform-domain bootstrap
  # below) needs to join this network too, not just services deployed via the stack.
  docker network create --driver overlay --attachable "$NETWORK_NAME"
fi

# --- Secrets -----------------------------------------------------------------
# Losing openploy_master_key makes every stored secret unrecoverable - back it up.

if ! docker secret inspect openploy_master_key >/dev/null 2>&1; then
  log "Generating master encryption key..."
  MASTER_KEY_VALUE="$(openssl rand -base64 32)"
  echo -n "$MASTER_KEY_VALUE" | docker secret create openploy_master_key -
  echo "$MASTER_KEY_VALUE" > "${OPENPLOY_HOME}/master.key.backup"
  chmod 600 "${OPENPLOY_HOME}/master.key.backup"
  log "Master key backed up to ${OPENPLOY_HOME}/master.key.backup - copy this somewhere safe now."
else
  log "openploy_master_key secret already exists, leaving it as-is"
fi

if ! docker secret inspect postgres_password >/dev/null 2>&1; then
  log "Generating Postgres password..."
  # hex, not base64 - this gets embedded raw into a postgres:// URL below, and
  # base64's +/= characters aren't URL-safe there (a stray "/" gets parsed as
  # a path separator, breaking the URL).
  POSTGRES_PASSWORD="$(openssl rand -hex 24)"
  echo -n "$POSTGRES_PASSWORD" | docker secret create postgres_password -
else
  fail "postgres_password secret already exists but this appears to be a fresh install - refusing to guess its value. Remove the secret manually if you intend to reset, or restore POSTGRES_PASSWORD from your records."
fi
export POSTGRES_PASSWORD

# --- Traefik static config ---------------------------------------------------

log "Writing Traefik static config..."
docker volume create traefik_static >/dev/null
docker run --rm \
  -v traefik_static:/etc/traefik \
  -v "${SCRIPT_DIR}/traefik/traefik.yml:/src/traefik.yml:ro" \
  alpine cp /src/traefik.yml /etc/traefik/traefik.yml

# --- Images + migrations -----------------------------------------------------

OPENPLOY_WEB_IMAGE="${OPENPLOY_WEB_IMAGE:-ghcr.io/enioladev1/openploy-web:latest}"
OPENPLOY_AGENT_IMAGE="${OPENPLOY_AGENT_IMAGE:-ghcr.io/enioladev1/openploy-agent:latest}"
export OPENPLOY_WEB_IMAGE OPENPLOY_AGENT_IMAGE

log "Pulling platform images..."
docker pull "$OPENPLOY_WEB_IMAGE"
docker pull "$OPENPLOY_AGENT_IMAGE"
docker pull postgres:16
docker pull registry:2
docker pull traefik:v3.2

# --- Image registry ------------------------------------------------------------
# Standalone container, not a Swarm service (see stack.yml's comment): builds
# push through the host's Docker daemon, which can't resolve overlay service
# names, and Swarm can't bind a published port to loopback only. registry:2
# has no auth, so 127.0.0.1 is what keeps it off the public internet.
if [[ -z "$(docker ps -q -f name=^openploy-registry$)" ]]; then
  log "Starting the internal image registry..."
  docker rm -f openploy-registry >/dev/null 2>&1 || true
  docker volume create openploy_registry_data >/dev/null
  docker run -d \
    --name openploy-registry \
    --restart always \
    -p 127.0.0.1:5000:5000 \
    -v openploy_registry_data:/var/lib/registry \
    registry:2 >/dev/null
else
  log "Internal image registry already running"
fi

# --- Persist deploy-time vars -------------------------------------------------
# `docker stack deploy`'s ${VAR} interpolation only ever reads the invoking
# shell's own environment, never a .env file - these vars only exist in this
# script's process otherwise, so any later manual `docker stack deploy` (e.g.
# to pick up an updated stack.yml) would silently interpolate them as blank.
# deploy.sh (written below) sources this file so that never happens.
cat > "${SCRIPT_DIR}/.env" <<EOF
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
APP_BASE_URL=${APP_BASE_URL}
PLATFORM_PUBLIC_IP=${PLATFORM_PUBLIC_IP}
OPENPLOY_WEB_IMAGE=${OPENPLOY_WEB_IMAGE}
OPENPLOY_AGENT_IMAGE=${OPENPLOY_AGENT_IMAGE}
EOF
chmod 600 "${SCRIPT_DIR}/.env"

cat > "${SCRIPT_DIR}/deploy.sh" <<'EOF'
#!/usr/bin/env bash
# Re-applies stack.yml with the vars it needs - use this (not a bare
# `docker stack deploy`) for any manual redeploy, or those vars interpolate
# as blank and break Postgres auth / domain-dependent config.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
set -a
source ./.env
set +a
docker stack deploy -c stack.yml openploy
EOF
chmod +x "${SCRIPT_DIR}/deploy.sh"

# --- Deploy -------------------------------------------------------------------
# web/agent may crash-loop briefly until migrations (below) finish - Swarm retries them.

log "Deploying the platform stack..."
"${SCRIPT_DIR}/deploy.sh"

log "Waiting for Postgres to accept connections..."
until docker exec "$(docker ps -q -f name=${STACK_NAME}_postgres)" pg_isready -U openploy >/dev/null 2>&1; do
  sleep 2
done

log "Running database migrations..."
docker run --rm --network "$NETWORK_NAME" \
  -e DATABASE_URL="postgres://openploy:${POSTGRES_PASSWORD}@${STACK_NAME}_postgres:5432/openploy" \
  "$OPENPLOY_AGENT_IMAGE" pnpm --filter @openploy/db migrate

log "Assigning the dashboard its nip.io domain..."
docker run --rm --network "$NETWORK_NAME" \
  -e DATABASE_URL="postgres://openploy:${POSTGRES_PASSWORD}@${STACK_NAME}_postgres:5432/openploy" \
  -e PLATFORM_DASHBOARD_HOST="$OPENPLOY_DOMAIN" \
  "$OPENPLOY_AGENT_IMAGE" pnpm --filter @openploy/agent bootstrap:platform-domain

GREEN=$'\033[0;32m'
RESET=$'\033[0m'
cat <<BANNER
${GREEN}
   ____  ____  _______   ______  __    ______  __
  / __ \\/ __ \\/ ____/ | / / __ \\/ /   / __ \\ \\/ /
 / / / / /_/ / __/ /  |/ / /_/ / /   / / / /\\  /
/ /_/ / ____/ /___/ /|  / ____/ /___/ /_/ / / /
\\____/_/   /_____/_/ |_/_/   /_____/\\____/ /_/
${RESET}
${GREEN}Installed successfully.${RESET}
BANNER

log ""
log "It may take a minute for the TLS certificate to issue. Open:"
log "  https://${OPENPLOY_DOMAIN}"
log "and sign up as the first admin - that page only works once."
log ""
log "Sign-up only works over that HTTPS URL, not plain HTTP - the session"
log "cookie requires it. If you need to check the server before the"
log "certificate issues, http://${PLATFORM_PUBLIC_IP}:3000 will load pages"
log "but can't keep you signed in."
log ""
log "Prefer your own domain? Set one anytime from Settings > Dashboard domain."
log ""
log "Next step after that: use the in-app GitHub App setup wizard (Settings > GitHub)."
