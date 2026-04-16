#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

REPO_URL="https://github.com/RXShare/RXShare.git"
DEFAULT_DIR="/opt/rxshare"

echo ""
echo -e "${CYAN}  ╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}  ║       ${BOLD}⚡ RXShare One-Click Setup${NC}${CYAN}      ║${NC}"
echo -e "${CYAN}  ╚══════════════════════════════════════╝${NC}"
echo ""

# --- Helpers ---
info()    { echo -e "  ${CYAN}→${NC} $1"; }
success() { echo -e "  ${GREEN}✓${NC} $1"; }
warn()    { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail()    { echo -e "  ${RED}✗${NC} $1"; exit 1; }

# --- Root check ---
if [ "$EUID" -ne 0 ]; then
  fail "Please run as root: ${BOLD}curl -fsSL <url> | sudo bash${NC}"
fi

# --- Detect OS ---
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS_ID="$ID"
else
  OS_ID="unknown"
fi

# --- Install Docker if missing ---
install_docker() {
  info "Installing Docker..."
  if command -v apt-get &>/dev/null; then
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl gnupg lsb-release >/dev/null 2>&1
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL "https://download.docker.com/linux/$OS_ID/gpg" | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS_ID $(lsb_release -cs 2>/dev/null || echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null 2>&1
  elif command -v dnf &>/dev/null; then
    dnf install -y -q dnf-plugins-core >/dev/null 2>&1
    dnf config-manager --add-repo "https://download.docker.com/linux/$OS_ID/docker-ce.repo" 2>/dev/null
    dnf install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null 2>&1
  elif command -v yum &>/dev/null; then
    yum install -y -q yum-utils >/dev/null 2>&1
    yum-config-manager --add-repo "https://download.docker.com/linux/$OS_ID/docker-ce.repo" 2>/dev/null
    yum install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null 2>&1
  else
    fail "Unsupported package manager. Install Docker manually: https://docs.docker.com/engine/install/"
  fi
  systemctl enable --now docker >/dev/null 2>&1
  success "Docker installed"
}

if ! command -v docker &>/dev/null; then
  install_docker
else
  success "Docker $(docker --version | grep -oP '\d+\.\d+\.\d+')"
fi

# Ensure docker compose works
if ! docker compose version &>/dev/null; then
  fail "docker compose plugin not found. Install it: https://docs.docker.com/compose/install/"
fi
success "Docker Compose $(docker compose version --short 2>/dev/null)"

# --- Install directory ---
INSTALL_DIR="${1:-$DEFAULT_DIR}"

echo ""
if [ -d "$INSTALL_DIR" ] && [ -f "$INSTALL_DIR/docker-compose.yml" ]; then
  info "Existing installation found at ${BOLD}$INSTALL_DIR${NC}"
  info "Updating..."
  git -C "$INSTALL_DIR" pull origin main 2>/dev/null || true
else
  info "Cloning RXShare to ${BOLD}$INSTALL_DIR${NC}..."
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR" 2>/dev/null
  success "Cloned"
fi

# --- Generate .env ---
ENV_FILE="$INSTALL_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p -c 64)
  ENCRYPTION_KEY=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p -c 64)
  cat > "$ENV_FILE" <<EOF
PORT=3000
JWT_SECRET=$JWT_SECRET
DB_TYPE=sqlite
STORAGE_TYPE=local
ENCRYPTION_KEY=$ENCRYPTION_KEY
EOF
  success "Generated .env with random secrets"
else
  success ".env already exists, keeping it"
fi

# --- Network mode selection ---
# Can be set via env: RXSHARE_MODE=1|2|3 or passed after the install dir
# 1=Cloudflare Tunnel, 2=Local only, 3=Open (default when non-interactive)
NETWORK_MODE="${RXSHARE_MODE:-}"

if [ -z "$NETWORK_MODE" ]; then
  # Try interactive prompt
  if [ -t 0 ] || [ -e /dev/tty ]; then
    echo ""
    echo -e "  ${BOLD}How do you want to expose RXShare?${NC}"
    echo ""
    echo -e "    ${CYAN}1)${NC} Public  — Cloudflare Tunnel (no ports exposed, HTTPS automatic)"
    echo -e "    ${CYAN}2)${NC} Local   — localhost only (127.0.0.1:6910)"
    echo -e "    ${CYAN}3)${NC} Open    — all interfaces (0.0.0.0:6910) ${YELLOW}← use with firewall${NC}"
    echo ""
    NETWORK_MODE=$(bash -c 'read -rp "  Choose [1/2/3] (default: 3): " m < /dev/tty 2>/dev/null; echo "$m"' 2>/dev/null) || true
    NETWORK_MODE="${NETWORK_MODE:-3}"
  else
    warn "Non-interactive shell detected, defaulting to open mode (0.0.0.0:6910)"
    warn "Set RXSHARE_MODE=1|2|3 to choose, or run the script directly"
    NETWORK_MODE="3"
  fi
fi

# --- Write docker-compose.yml ---
COMPOSE_FILE="$INSTALL_DIR/docker-compose.yml"

case "$NETWORK_MODE" in
  2)
    # Local only
    cat > "$COMPOSE_FILE" <<'YAML'
services:
  rxshare:
    build: .
    ports:
      - "127.0.0.1:6910:3000"
    volumes:
      - rxshare-data:/app/data
    env_file:
      - .env
    environment:
      - NODE_ENV=production
    restart: unless-stopped

volumes:
  rxshare-data:
YAML
    success "Configured for local access only (127.0.0.1:6910)"
    ;;
  3)
    # Open on all interfaces
    cat > "$COMPOSE_FILE" <<'YAML'
services:
  rxshare:
    build: .
    ports:
      - "6910:3000"
    volumes:
      - rxshare-data:/app/data
    env_file:
      - .env
    environment:
      - NODE_ENV=production
    restart: unless-stopped

volumes:
  rxshare-data:
YAML
    success "Configured on all interfaces (0.0.0.0:6910)"
    warn "Make sure you have a firewall configured"
    ;;
  *)
    # Cloudflare Tunnel (no ports exposed to host)
    CF_TOKEN="${CF_TUNNEL_TOKEN:-}"
    if [ -z "$CF_TOKEN" ]; then
      echo ""
      info "Cloudflare Tunnel requires a tunnel token."
      echo -e "  ${CYAN}Get one at:${NC} https://one.dash.cloudflare.com → Networks → Tunnels → Create"
      echo -e "  ${CYAN}Set the service to:${NC} ${BOLD}http://rxshare:3000${NC}"
      echo ""
      CF_TOKEN=$(bash -c 'read -rp "  Paste your Cloudflare Tunnel token: " t < /dev/tty 2>/dev/null; echo "$t"' 2>/dev/null) || true
    fi
    if [ -z "$CF_TOKEN" ]; then
      fail "Tunnel token is required. Set CF_TUNNEL_TOKEN env var or run interactively."
    fi

    cat > "$COMPOSE_FILE" <<YAML
services:
  rxshare:
    build: .
    volumes:
      - rxshare-data:/app/data
    env_file:
      - .env
    environment:
      - NODE_ENV=production
    restart: unless-stopped

  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel --no-autoupdate run --token $CF_TOKEN
    depends_on:
      - rxshare
    restart: unless-stopped

volumes:
  rxshare-data:
YAML
    success "Configured with Cloudflare Tunnel (no ports exposed)"
    ;;
esac

# --- Build & Start ---
echo ""
info "Building and starting RXShare (this may take a minute)..."
docker compose -f "$COMPOSE_FILE" --project-directory "$INSTALL_DIR" up -d --build 2>&1 | tail -5

echo ""
echo -e "${GREEN}  ╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}  ║       ${BOLD}✓ RXShare is up and running!${NC}${GREEN}        ║${NC}"
echo -e "${GREEN}  ╚══════════════════════════════════════════╝${NC}"
echo ""

case "$NETWORK_MODE" in
  2)
    echo -e "  ${BOLD}Open:${NC} http://localhost:6910"
    ;;
  3)
    IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    echo -e "  ${BOLD}Open:${NC} http://${IP:-your-server-ip}:6910"
    ;;
  *)
    echo -e "  ${BOLD}Open:${NC} Your Cloudflare Tunnel domain"
    ;;
esac

echo ""
echo -e "  The ${BOLD}/setup${NC} page will guide you through"
echo -e "  creating your admin account and configuring"
echo -e "  your instance."
echo ""
echo -e "  ${CYAN}Useful commands:${NC}"
echo -e "    cd $INSTALL_DIR"
echo -e "    docker compose logs -f        ${CYAN}# view logs${NC}"
echo -e "    docker compose down            ${CYAN}# stop${NC}"
echo -e "    docker compose up -d --build   ${CYAN}# rebuild & start${NC}"
echo ""
