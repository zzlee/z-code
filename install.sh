#!/usr/bin/env bash

set -e

REPO="zzlee/z-code"
FALLBACK_URL="git+https://github.com/${REPO}.git"

# Define colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Helper functions for logging
info() { echo -e "${GREEN}==>${NC} ${1}"; }
warn() { echo -e "${YELLOW}WARNING:${NC} ${1}"; }
error() { echo -e "${RED}ERROR:${NC} ${1}" >&2; }
fatal() { error "${1}"; exit 1; }

# Check for required commands
check_dependency() {
  local cmd=$1
  if ! command -v "$cmd" >/dev/null 2>&1; then
    fatal "'$cmd' is required but not installed. Please install it and try again."
  fi
}

info "Checking dependencies..."
check_dependency node
check_dependency npm
check_dependency curl

info "Fetching the latest release for $REPO..."

# Use GitHub API to get the latest release data
LATEST_RELEASE_API="https://api.github.com/repos/${REPO}/releases/latest"

# Get the URL of the .tgz asset from the latest release
TARBALL_URL=$(curl -fsSL "$LATEST_RELEASE_API" | grep '"browser_download_url":' | grep '\.tgz"' | head -n 1 | cut -d '"' -f 4 || true)

INSTALL_CMD=""

if [ -n "$TARBALL_URL" ]; then
    info "Found latest release tarball: $TARBALL_URL"
    info "Installing z-code..."

    # Attempt to install the tarball
    if npm install -g "$TARBALL_URL"; then
        info "z-code installed successfully!"
        exit 0
    else
        warn "Failed to install from tarball. Falling back to source installation..."
        INSTALL_CMD="npm install -g $FALLBACK_URL"
    fi
else
    warn "Could not find a .tgz release asset. Falling back to source installation..."
    INSTALL_CMD="npm install -g $FALLBACK_URL"
fi

if [ -n "$INSTALL_CMD" ]; then
    info "Running fallback installation: $INSTALL_CMD"
    if eval "$INSTALL_CMD"; then
        info "z-code installed successfully from source!"
    else
        fatal "Failed to install z-code."
    fi
fi
