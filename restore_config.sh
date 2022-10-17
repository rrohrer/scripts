# Make the directories
mkdir -p ~/.config/nvim/lua/user/
mkdir -p ~/config/alacritty/

# copy the files
cp ~/scripts/config_backup/.tmux.conf ~/.tmux.conf 
cp ~/scripts/config_backup/.config/nvim/lua/user/init.lua ~/.config/nvim/lua/user/init.lua
cp ~/scripts/config_backup/.config/alacritty/alacritty.yml ~/.config/alacritty/alacritty.yml
