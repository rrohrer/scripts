# Make the directories
# mkdir -p ~/.config/nvim/lua/user/
mkdir -p ~/.config/nvim/
mkdir -p ~/.config/alacritty/
mkdir -p ~/.config/helix/
mkdir -p ~/.config/helix/themes/
mkdir -p ~/.config/zellij/
mkdir -p ~/.config/ghostty/themes/

# copy the files
cp ~/scripts/config_backup/.tmux.conf ~/.tmux.conf
# cp ~/scripts/config_backup/.config/nvim/lua/user/init.lua ~/.config/nvim/lua/user/init.lua
cp -r ~/scripts/config_backup/.config/nvim/ ~/.config/nvim/
cp ~/scripts/config_backup/.config/alacritty/alacritty.yml ~/.config/alacritty/alacritty.yml
cp ~/scripts/config_backup/.config/alacritty/alacritty.toml ~/.config/alacritty/alacritty.toml
cp ~/scripts/config_backup/.config/helix/config.toml ~/.config/helix/config.toml
cp -r ~/scripts/config_backup/.config/helix/themes/ ~/.config/helix/themes/
cp ~/scripts/config_backup/.config/zellij/config.kdl ~/.config/zellij/config.kdl
cp ~/scripts/config_backup/.config/ghostty/config ~/.config/ghostty/config
cp -r ~/scripts/config_backup/.config/ghostty/themes/ ~/.config/ghostty/themes/
cp ~/scripts/config_backup/.zshrc ~/.zshrc
