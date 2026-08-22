export PYENV_ROOT="$HOME/.pyenv"
[[ -d $PYENV_ROOT/bin ]] && export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init -)"
export CLICOLOR=1
eval "$(starship init zsh)"
export PLAYDATE_SDK_PATH="$HOME/Developer/PlaydateSDK"
export PATH="$PATH:$PLAYDATE_SDK_ROOT/bin"

export PATH="$HOME/.local/bin:$PATH"

alias tm='tmux -S /tmp/tmux-shared'


# Added by Antigravity CLI installer
export PATH="/Users/ryanrohrer/.local/bin:$PATH"

# make sure omp uses nvim
export VISUAL="nvim"
