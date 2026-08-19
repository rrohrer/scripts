#!/bin/sh
# directory this script lives in (works no matter where the repo is cloned)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP="$SCRIPT_DIR/config_backup"

if [ ! -d "$BACKUP" ]; then
    echo "error: $BACKUP not found (run backup_config.sh first)" >&2
    exit 1
fi

# Make the directories
# mkdir -p ~/.config/nvim/lua/user/
mkdir -p ~/.config/nvim/
mkdir -p ~/.config/alacritty/
mkdir -p ~/.config/helix/
mkdir -p ~/.config/helix/themes/
mkdir -p ~/.config/zellij/
mkdir -p ~/.config/ghostty/themes/
mkdir -p ~/.config/kitty/
mkdir -p ~/.omp/agent/extensions/
mkdir -p ~/.pi/agent/extensions/

# copy the files
cp "$BACKUP"/.tmux.conf ~/.tmux.conf
# cp "$BACKUP"/.config/nvim/lua/user/init.lua ~/.config/nvim/lua/user/init.lua
cp -r "$BACKUP"/.config/nvim/. ~/.config/nvim/
cp "$BACKUP"/.config/alacritty/alacritty.yml ~/.config/alacritty/alacritty.yml
cp "$BACKUP"/.config/alacritty/alacritty.toml ~/.config/alacritty/alacritty.toml
cp "$BACKUP"/.config/helix/config.toml ~/.config/helix/config.toml
cp -r "$BACKUP"/.config/helix/themes/. ~/.config/helix/themes/
cp "$BACKUP"/.config/zellij/config.kdl ~/.config/zellij/config.kdl
cp "$BACKUP"/.config/ghostty/config ~/.config/ghostty/config
cp -r "$BACKUP"/.config/ghostty/themes/. ~/.config/ghostty/themes/
cp "$BACKUP"/.config/kitty/kitty.conf ~/.config/kitty/kitty.conf
cp "$BACKUP"/.omp/agent/config.yml ~/.omp/agent/config.yml
cp -r "$BACKUP"/.omp/agent/extensions/. ~/.omp/agent/extensions/
cp "$BACKUP"/.zshrc ~/.zshrc
cp -r "$BACKUP"/.pi/agent/extensions/. ~/.pi/agent/extensions/
cp -r "$BACKUP"/.pi/agent/agents/. ~/.pi/agent/agents/
cp -r "$BACKUP"/.pi/agent/prompts/. ~/.pi/agent/prompts/
cp -r "$BACKUP"/.pi/agent/themes/. ~/.pi/agent/themes/

# Linux-only desktop configs (skip on macOS)
if [ "$(uname)" = "Linux" ]; then
    # configs only take effect if the programs are installed
    for pkg in hyprland waybar wofi dunst sddm swaybg; do
        command -v "$pkg" >/dev/null 2>&1 || echo "note: '$pkg' not installed; its config was restored but won't do anything until you install it"
    done

    # hyprland
    mkdir -p ~/.config/hypr/
    cp "$BACKUP"/.config/hypr/hyprland.conf ~/.config/hypr/hyprland.conf

    # wofi
    mkdir -p ~/.config/wofi/
    cp "$BACKUP"/.config/wofi/config ~/.config/wofi/config
    cp "$BACKUP"/.config/wofi/style.css ~/.config/wofi/style.css

    # waybar
    mkdir -p ~/.config/waybar/
    cp "$BACKUP"/.config/waybar/config.jsonc ~/.config/waybar/config.jsonc
    cp "$BACKUP"/.config/waybar/style.css ~/.config/waybar/style.css

    # dunst
    mkdir -p ~/.config/dunst/
    cp "$BACKUP"/.config/dunst/dunstrc ~/.config/dunst/dunstrc

    # wallpapers
    mkdir -p ~/Pictures/Wallpapers/
    cp -r "$BACKUP"/Pictures/Wallpapers/. ~/Pictures/Wallpapers/

    # sddm theme build files
    mkdir -p ~/sddm-theme-build/
    cp -r "$BACKUP"/sddm-theme-build/. ~/sddm-theme-build/

    # sddm system config + theme (requires root)
    if [ -d "$BACKUP"/sddm/sddm.conf.d ]; then
        sudo cp -r "$BACKUP"/sddm/sddm.conf.d/. /etc/sddm.conf.d/
    fi
    if [ -d "$BACKUP"/sddm-theme-build/gruvbox-material ]; then
        sudo mkdir -p /usr/share/sddm/themes/
        sudo cp -r "$BACKUP"/sddm-theme-build/gruvbox-material /usr/share/sddm/themes/
    fi
fi

