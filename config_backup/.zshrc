export PYENV_ROOT="$HOME/.pyenv"
[[ -d $PYENV_ROOT/bin ]] && export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init -)"
export CLICOLOR=1
eval "$(starship init zsh)"
export PLAYDATE_SDK_PATH="$HOME/Developer/PlaydateSDK"
export PATH="$PATH:$PLAYDATE_SDK_ROOT/bin"

