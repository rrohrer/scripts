# create the directory to backup files
mkdir -p ~/scripts/config_backup

# backup tmux config
cp ~/.tmux.conf ~/scripts/config_backup/.tmux.conf

# backup neovim config 
# mkdir -p ~/scripts/config_backup/.config/nvim/lua/user
# cp ~/.config/nvim/lua/user/init.lua ~/scripts/config_backup/.config/nvim/lua/user/init.lua
mkdir -p ~/scripts/config_backup/.config/nvim/
cp -r ~/.config/nvim/ ~/scripts/config_backup/nvim/
rm -rf ~/scripts/config_backup/nvim/plugin/

# backup alacritty config
mkdir -p ~/scripts/config_backup/.config/alacritty
cp ~/.config/alacritty/alacritty.yml ~/scripts/config_backup/.config/alacritty/alacritty.yml

# backup helix config
mkdir -p ~/scripts/config_backup/.config/helix
cp ~/.config/helix/config.toml ~/scripts/config_backup/.config/helix/config.toml

# backup helix custom themes
mkdir -p ~/scripts/config_backup/.config/helix/themes
cp ~/.config/helix/themes/gruvbox-fixed.toml ~/scripts/config_backup/.config/helix/themes/gruvbox-fixed.toml

# backup the zellij config
mkdir -p ~/scripts/config_backup/.config/zellij
cp ~/.config/zellij/config.kdl ~/scripts/config_backup/.config/zellij/config.kdl
