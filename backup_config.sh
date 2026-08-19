# create the directory to backup files
mkdir -p ~/scripts/config_backup

# backup tmux config
cp ~/.tmux.conf ~/scripts/config_backup/.tmux.conf

# backup neovim config
# mkdir -p ~/scripts/config_backup/.config/nvim/lua/user
# cp ~/.config/nvim/lua/user/init.lua ~/scripts/config_backup/.config/nvim/lua/user/init.lua
mkdir -p ~/scripts/config_backup/.config/nvim/
cp -r ~/.config/nvim/. ~/scripts/config_backup/.config/nvim/
rm -rf ~/scripts/config_backup/.config/nvim/plugin/

# backup alacritty config
mkdir -p ~/scripts/config_backup/.config/alacritty
cp ~/.config/alacritty/alacritty.yml ~/scripts/config_backup/.config/alacritty/alacritty.yml
cp ~/.config/alacritty/alacritty.toml ~/scripts/config_backup/.config/alacritty/alacritty.toml

# backup helix config
mkdir -p ~/scripts/config_backup/.config/helix
cp ~/.config/helix/config.toml ~/scripts/config_backup/.config/helix/config.toml

# backup helix custom themes
mkdir -p ~/scripts/config_backup/.config/helix/themes
cp -r ~/.config/helix/themes/. ~/scripts/config_backup/.config/helix/themes/

# backup the zellij config
mkdir -p ~/scripts/config_backup/.config/zellij
cp ~/.config/zellij/config.kdl ~/scripts/config_backup/.config/zellij/config.kdl

# backup ghostty config
mkdir -p ~/scripts/config_backup/.config/ghostty/themes
cp -r ~/.config/ghostty/themes/. ~/scripts/config_backup/.config/ghostty/themes/
cp ~/.config/ghostty/config ~/scripts/config_backup/.config/ghostty/config

cp ~/.zshrc ~/scripts/config_backup/.zshrc

mkdir -p ~/scripts/config_backup/.pi/agent/extensions
cp -r ~/.pi/agent/extensions/. ~/scripts/config_backup/.pi/agent/extensions/

mkdir -p ~/scripts/config_backup/.pi/agent/agents
cp -r ~/.pi/agent/agents/. ~/scripts/config_backup/.pi/agent/agents/

mkdir -p ~/scripts/config_backup/.pi/agent/prompts
cp -r ~/.pi/agent/prompts/. ~/scripts/config_backup/.pi/agent/prompts/

mkdir -p ~/scripts/config_backup/.pi/agent/themes
cp -r ~/.pi/agent/themes/. ~/scripts/config_backup/.pi/agent/themes/

# Linux-only desktop configs (skip on macOS)
if [ "$(uname)" = "Linux" ]; then
    # hyprland config
    mkdir -p ~/scripts/config_backup/.config/hypr
    cp ~/.config/hypr/hyprland.conf ~/scripts/config_backup/.config/hypr/hyprland.conf

    # wofi config
    mkdir -p ~/scripts/config_backup/.config/wofi
    cp ~/.config/wofi/config ~/scripts/config_backup/.config/wofi/config
    cp ~/.config/wofi/style.css ~/scripts/config_backup/.config/wofi/style.css

    # waybar config
    mkdir -p ~/scripts/config_backup/.config/waybar
    cp ~/.config/waybar/config.jsonc ~/scripts/config_backup/.config/waybar/config.jsonc
    cp ~/.config/waybar/style.css ~/scripts/config_backup/.config/waybar/style.css

    # dunst config
    mkdir -p ~/scripts/config_backup/.config/dunst
    cp ~/.config/dunst/dunstrc ~/scripts/config_backup/.config/dunst/dunstrc

    # wallpapers (referenced by hyprland.conf swaybg)
    mkdir -p ~/scripts/config_backup/Pictures/Wallpapers
    cp -r ~/Pictures/Wallpapers/. ~/scripts/config_backup/Pictures/Wallpapers/

    # sddm system config (theme selection etc.)
    mkdir -p ~/scripts/config_backup/sddm/sddm.conf.d
    cp -r /etc/sddm.conf.d/. ~/scripts/config_backup/sddm/sddm.conf.d/ 2>/dev/null || true

    # sddm theme build files
    mkdir -p ~/scripts/config_backup/sddm-theme-build
    cp -r ~/sddm-theme-build/. ~/scripts/config_backup/sddm-theme-build/
fi
