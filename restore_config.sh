# Make the directories
mkdir -p ~/.config/nvim/lua/user/
mkdir -p ~/.config/alacritty/
mkdir -p ~/.config/helix/
mkdir -p ~/.config/zellij/

# copy the files
cp ~/scripts/config_backup/.tmux.conf ~/.tmux.conf 
cp ~/scripts/config_backup/.config/nvim/lua/user/init.lua ~/.config/nvim/lua/user/init.lua
cp ~/scripts/config_backup/.config/alacritty/alacritty.yml ~/.config/alacritty/alacritty.yml
cp ~/scripts/config_backup/.config/helix/config.toml ~/.config/helix/config.toml
cp ~/scripts/config_backup/.config/zellij/config.kdl ~/.config/zellij/config.kdl
