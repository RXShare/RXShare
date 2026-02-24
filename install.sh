#!/bin/bash
set -e

echo ""
echo "  ╔══════════════════════════════════╗"
echo "  ║         RXShare Installer        ║"
echo "  ╚══════════════════════════════════╝"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js is not installed. Install Node.js 18+ first."
  echo "   https://nodejs.org/"
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Node.js 18+ required. You have $(node -v)."
  exit 1
fi

echo "✓ Node.js $(node -v)"

# Check npm
if ! command -v npm &> /dev/null; then
  echo "❌ npm is not installed."
  exit 1
fi

echo "✓ npm $(npm -v)"

# Determine install directory
INSTALL_DIR="${1:-$(pwd)/rxshare}"

if [ -d "$INSTALL_DIR" ] && [ -f "$INSTALL_DIR/package.json" ]; then
  echo ""
  echo "→ Existing installation found at $INSTALL_DIR"
  echo "  Updating..."
  cd "$INSTALL_DIR"
  git pull origin main 2>/dev/null || true
else
  echo ""
  echo "→ Installing to $INSTALL_DIR"
  git clone https://github.com/RXShare/RXShare.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# Install dependencies
echo ""
echo "→ Installing dependencies..."
npm install --production=false

# Build
echo ""
echo "→ Building..."
npm run build

# Create data directory
mkdir -p data

# Generate .env if it doesn't exist
if [ ! -f .env ]; then
  JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  cat > .env << EOF
PORT=3000
JWT_SECRET=$JWT_SECRET
DB_TYPE=sqlite
STORAGE_TYPE=local
EOF
  echo "✓ Generated .env with random JWT_SECRET"
else
  echo "✓ .env already exists, skipping"
fi

echo ""
echo "══════════════════════════════════════"
echo "  ✓ RXShare installed successfully!"
echo "══════════════════════════════════════"
echo ""
echo "  Start the server:"
echo "    cd $INSTALL_DIR"
echo "    npm start"
echo ""
echo "  Then open http://localhost:3000"
echo "  The setup wizard will guide you through"
echo "  the rest of the configuration."
echo ""
