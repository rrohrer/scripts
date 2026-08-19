# Make the directories
# mkdir -p ~/.config/nvim/lua/user/
mkdir -p ~/.config/nvim/
mkdir -p ~/.config/alacritty/
mkdir -p ~/.config/helix/
mkdir -p ~/.config/helix/themes/
mkdir -p ~/.config/zellij/
mkdir -p ~/.config/ghostty/themes/
mkdir -p ~/.pi/agent/extensions/

# copy the files
cp ~/scripts/config_backup/.tmux.conf ~/.tmux.conf
# cp ~/scripts/config_backup/.config/nvim/lua/user/init.lua ~/.config/nvim/lua/user/init.lua
cp -r ~/scripts/config_backup/.config/nvim/. ~/.config/nvim/
cp ~/scripts/config_backup/.config/alacritty/alacritty.yml ~/.config/alacritty/alacritty.yml
cp ~/scripts/config_backup/.config/alacritty/alacritty.toml ~/.config/alacritty/alacritty.toml
cp ~/scripts/config_backup/.config/helix/config.toml ~/.config/helix/config.toml
cp -r ~/scripts/config_backup/.config/helix/themes/. ~/.config/helix/themes/
cp ~/scripts/config_backup/.config/zellij/config.kdl ~/.config/zellij/config.kdl
cp ~/scripts/config_backup/.config/ghostty/config ~/.config/ghostty/config
cp -r ~/scripts/config_backup/.config/ghostty/themes/. ~/.config/ghostty/themes/
cp ~/scripts/config_backup/.zshrc ~/.zshrc
cp -r ~/scripts/config_backup/.pi/agent/extensions/. ~/.pi/agent/extensions/
cp -r ~/scripts/config_backup/.pi/agent/agents/. ~/.pi/agent/agents/
cp -r ~/scripts/config_backup/.pi/agent/prompts/. ~/.pi/agent/prompts/
cp -r ~/scripts/config_backup/.pi/agent/themes/. ~/.pi/agent/themes/

# Linux-only desktop configs (skip on macOS)
if [ "$(uname)" = "Linux" ]; then
    # hyprland
    mkdir -p ~/.config/hypr/
    cp ~/scripts/config_backup/.config/hypr/hyprland.conf ~/.config/hypr/hyprland.conf

    # wofi
    mkdir -p ~/.config/wofi/
    cp ~/scripts/config_backup/.config/wofi/config ~/.config/wofi/config
    cp ~/scripts/config_backup/.config/wofi/style.css ~/.config/wofi/style.css

    # waybar
    mkdir -p ~/.config/waybar/
    cp ~/scripts/config_backup/.config/waybar/config.jsonc ~/.config/waybar/config.jsonc
    cp ~/scripts/config_backup/.config/waybar/style.css ~/.config/waybar/style.css

    # dunst
    mkdir -p ~/.config/dunst/
    cp ~/scripts/config_backup/.config/dunst/dunstrc ~/.config/dunst/dunstrc

    # wallpapers
    mkdir -p ~/Pictures/Wallpapers/
    cp -r ~/scripts/config_backup/Pictures/Wallpapers/. ~/Pictures/Wallpapers/

    # sddm theme build files
    mkdir -p ~/sddm-theme-build/
    cp -r ~/scripts/config_backup/sddm-theme-build/. ~/sddm-theme-build/

    # sddm system config (requires root)
    if [ -d ~/scripts/config_backup/sddm/sddm.conf.d ]; then
        sudo cp -r ~/scripts/config_backup/sddm/sddm.conf.d/. /etc/sddm.conf.d/
    fi
fi

