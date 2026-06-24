#!/usr/bin/env bash
# Install z-* helper scripts to ~/.local/bin
#
# The scripts are thin wrappers around `pi` with predefined system prompts.
# Source files live in scripts/z-*; installed to ~/.local/bin/z-*.
#
# Usage:
#   ./scripts/install.sh                                   # Default: opencode / bit_pickle
#   ./scripts/install.sh --model llama3                    # Override just the model
#   ./scripts/install.sh --provider opencode --model big_pickle  # Both overridden
#   PI_PROVIDER=opencode PI_MODEL=big_pickle ./scripts/install.sh   # Via env vars
#   ./scripts/install.sh --bare                            # Copy as-is, no overrides
#
# By default it inserts --provider opencode --model bit_pickle right after
# "exec pi \" in the installed script. Pass --bare to skip this.
# This lets you keep generic sources in the repo while customizing the
# installed copies.

set -euo pipefail

INSTALL_DIR="${HOME}/.local/bin"
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
PI_PROVIDER="${PI_PROVIDER:-opencode}"
PI_MODEL="${PI_MODEL:-big-pickle}"
BARE=false

# Parse CLI args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --provider)
      PI_PROVIDER="$2"
      shift 2
      ;;
    --model)
      PI_MODEL="$2"
      shift 2
      ;;
    --bare)
      BARE=true
      shift
      ;;
    *)
      echo "Usage: $0 [--provider <name>] [--model <name>] [--bare]"
      echo "  Or set PI_PROVIDER and PI_MODEL environment variables."
      echo "  --bare: install without provider/model overrides (copy as-is)"
      exit 1
      ;;
  esac
done

mkdir -p "$INSTALL_DIR"

for src in "$SOURCE_DIR"/z-*; do
  name="$(basename "$src")"
  dst="${INSTALL_DIR}/${name}"

  if [[ "$BARE" == false ]]; then
    # Build the provider/model flag line
    line="  "
    if [[ -n "$PI_PROVIDER" ]]; then
      line+="--provider ${PI_PROVIDER}"
    fi
    if [[ -n "$PI_MODEL" ]]; then
      [[ -n "$PI_PROVIDER" ]] && line+=" "
      line+="--model ${PI_MODEL}"
    fi
    line+=" \\"

    # Insert/replace the provider/model line after "exec pi \"
    awk -v insert="$line" '
      /^exec pi \\$/ { printed_exec = 1; print; next }

      # Skip existing provider/model/think lines immediately after exec pi \
      printed_exec && /^  --(provider|model) / { next }

      # If we hit a non-provider/model line after exec pi, insert our line first
      printed_exec {
        print insert
        printed_exec = 0  # only insert once
      }

      { print }
    ' "$src" > "$dst"
    chmod +x "$dst"
  else
    # No override — copy as-is
    cp "$src" "$dst"
    chmod +x "$dst"
  fi

  echo "  → ${dst}"
done

# Offer z-howto READLINE widget installation
if [[ -f "${INSTALL_DIR}/z-howto" ]]; then
  echo ""
  echo "z-howto widget: press Ctrl+H to insert generated commands at your prompt."
  read -r -p "Install widget into ~/.bashrc? [y/N] " answer
  if [[ "$answer" =~ ^[Yy] ]]; then
    if grep -qs '_z_howto_widget' ~/.bashrc 2>/dev/null; then
      echo "  Widget already installed in ~/.bashrc (skipped)"
    else
      "${INSTALL_DIR}/z-howto" --install-widget >> ~/.bashrc
      echo "  Widget added to ~/.bashrc"
      echo "  Run: source ~/.bashrc  (or open a new terminal)"
    fi
  else
    echo "  To install manually later:"
    echo "    eval \"\$(${INSTALL_DIR}/z-howto --install-widget)\"     # activate now"
    echo "    ${INSTALL_DIR}/z-howto --install-widget >> ~/.bashrc   # permanent"
  fi
fi

echo ""
echo "Done. Make sure ${INSTALL_DIR} is in your PATH:"
echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
