#!/bin/sh
# directory this script lives in (works no matter where the repo is cloned)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# create the directory to backup files
mkdir -p "$SCRIPT_DIR/config_backup"

# backup tmux config
cp ~/.tmux.conf "$SCRIPT_DIR"/config_backup/.tmux.conf

# backup neovim config
# mkdir -p "$SCRIPT_DIR"/config_backup/.config/nvim/lua/user
# cp ~/.config/nvim/lua/user/init.lua "$SCRIPT_DIR"/config_backup/.config/nvim/lua/user/init.lua
mkdir -p "$SCRIPT_DIR"/config_backup/.config/nvim/
cp -r ~/.config/nvim/. "$SCRIPT_DIR"/config_backup/.config/nvim/
rm -rf "$SCRIPT_DIR"/config_backup/.config/nvim/plugin/

# backup alacritty config
mkdir -p "$SCRIPT_DIR"/config_backup/.config/alacritty
cp ~/.config/alacritty/alacritty.yml "$SCRIPT_DIR"/config_backup/.config/alacritty/alacritty.yml
cp ~/.config/alacritty/alacritty.toml "$SCRIPT_DIR"/config_backup/.config/alacritty/alacritty.toml

# backup helix config
mkdir -p "$SCRIPT_DIR"/config_backup/.config/helix
cp ~/.config/helix/config.toml "$SCRIPT_DIR"/config_backup/.config/helix/config.toml

# backup helix custom themes
mkdir -p "$SCRIPT_DIR"/config_backup/.config/helix/themes
cp -r ~/.config/helix/themes/. "$SCRIPT_DIR"/config_backup/.config/helix/themes/

# backup the zellij config
mkdir -p "$SCRIPT_DIR"/config_backup/.config/zellij
cp ~/.config/zellij/config.kdl "$SCRIPT_DIR"/config_backup/.config/zellij/config.kdl

# backup ghostty config
mkdir -p "$SCRIPT_DIR"/config_backup/.config/ghostty/themes
cp -r ~/.config/ghostty/themes/. "$SCRIPT_DIR"/config_backup/.config/ghostty/themes/
cp ~/.config/ghostty/config "$SCRIPT_DIR"/config_backup/.config/ghostty/config

# backup kitty config
mkdir -p "$SCRIPT_DIR"/config_backup/.config/kitty
cp ~/.config/kitty/kitty.conf "$SCRIPT_DIR"/config_backup/.config/kitty/kitty.conf

# backup omp config and extensions (not sessions, DBs, blobs, or other large/ephemeral state)
mkdir -p "$SCRIPT_DIR"/config_backup/.omp/agent/extensions
cp ~/.omp/agent/config.yml "$SCRIPT_DIR"/config_backup/.omp/agent/config.yml
cp -r ~/.omp/agent/extensions/. "$SCRIPT_DIR"/config_backup/.omp/agent/extensions/

cp ~/.zshrc "$SCRIPT_DIR"/config_backup/.zshrc

mkdir -p "$SCRIPT_DIR"/config_backup/.pi/agent/extensions
cp -r ~/.pi/agent/extensions/. "$SCRIPT_DIR"/config_backup/.pi/agent/extensions/

mkdir -p "$SCRIPT_DIR"/config_backup/.pi/agent/agents
cp -r ~/.pi/agent/agents/. "$SCRIPT_DIR"/config_backup/.pi/agent/agents/

mkdir -p "$SCRIPT_DIR"/config_backup/.pi/agent/prompts
cp -r ~/.pi/agent/prompts/. "$SCRIPT_DIR"/config_backup/.pi/agent/prompts/

mkdir -p "$SCRIPT_DIR"/config_backup/.pi/agent/themes
cp -r ~/.pi/agent/themes/. "$SCRIPT_DIR"/config_backup/.pi/agent/themes/

# Linux-only desktop configs (skip on macOS)
if [ "$(uname)" = "Linux" ]; then
    # hyprland config
    mkdir -p "$SCRIPT_DIR"/config_backup/.config/hypr
    cp ~/.config/hypr/hyprland.conf "$SCRIPT_DIR"/config_backup/.config/hypr/hyprland.conf

    # wofi config
    mkdir -p "$SCRIPT_DIR"/config_backup/.config/wofi
    cp ~/.config/wofi/config "$SCRIPT_DIR"/config_backup/.config/wofi/config
    cp ~/.config/wofi/style.css "$SCRIPT_DIR"/config_backup/.config/wofi/style.css

    # waybar config
    mkdir -p "$SCRIPT_DIR"/config_backup/.config/waybar
    cp ~/.config/waybar/config.jsonc "$SCRIPT_DIR"/config_backup/.config/waybar/config.jsonc
    cp ~/.config/waybar/style.css "$SCRIPT_DIR"/config_backup/.config/waybar/style.css

    # dunst config
    mkdir -p "$SCRIPT_DIR"/config_backup/.config/dunst
    cp ~/.config/dunst/dunstrc "$SCRIPT_DIR"/config_backup/.config/dunst/dunstrc

    # wallpapers (referenced by hyprland.conf swaybg)
    mkdir -p "$SCRIPT_DIR"/config_backup/Pictures/Wallpapers
    cp -r ~/Pictures/Wallpapers/. "$SCRIPT_DIR"/config_backup/Pictures/Wallpapers/

    # sddm system config (theme selection etc.)
    mkdir -p "$SCRIPT_DIR"/config_backup/sddm/sddm.conf.d
    cp -r /etc/sddm.conf.d/. "$SCRIPT_DIR"/config_backup/sddm/sddm.conf.d/ 2>/dev/null || true

    # sddm theme build files
    mkdir -p "$SCRIPT_DIR"/config_backup/sddm-theme-build
    cp -r ~/sddm-theme-build/. "$SCRIPT_DIR"/config_backup/sddm-theme-build/
fi
