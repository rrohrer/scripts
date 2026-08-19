#!/usr/bin/env bash
#
# Installs the "gruvbox-material" SDDM login theme system-wide and makes it
# the active greeter. Run with root:
#
#     sudo ~/sddm-theme-build/install-sddm-theme.sh
#
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
    echo "This script must be run as root:  sudo $0" >&2
    exit 1
fi

# Resolve the directory this script lives in (so it finds the theme payload)
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
THEME_SRC="$SRC_DIR/gruvbox-material"
THEME_DST="/usr/share/sddm/themes/gruvbox-material"
CONF_DIR="/etc/sddm.conf.d"
CONF_FILE="$CONF_DIR/10-theme.conf"

if [[ ! -d "$THEME_SRC" ]]; then
    echo "Theme payload not found at: $THEME_SRC" >&2
    exit 1
fi

echo ">> Installing theme to $THEME_DST"
rm -rf "$THEME_DST"
mkdir -p "$THEME_DST"
cp -r "$THEME_SRC"/. "$THEME_DST"/
chown -R root:root "$THEME_DST"
chmod -R a+rX "$THEME_DST"

echo ">> Setting SDDM to use the theme ($CONF_FILE)"
mkdir -p "$CONF_DIR"
if [[ -f "$CONF_FILE" ]]; then
    cp "$CONF_FILE" "$CONF_FILE.bak.$(date +%s)"
fi
cat > "$CONF_FILE" <<'EOF'
[Theme]
Current=gruvbox-material

[General]
# Numlock on at the login screen
Numlock=on
EOF

echo ">> Done."
echo
echo "Preview without logging out:"
echo "    sddm-greeter-qt6 --test-mode --theme $THEME_DST"
echo
echo "Apply for real: reboot, or restart the display manager (ends your session):"
echo "    systemctl restart sddm"
