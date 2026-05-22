#!/bin/bash

##
## Description: Installs Vim with the Pathogen plugin manager and configures
##              Syntastic linting for Bash (ShellCheck), Perl (perlcritic),
##              Python (pylint), and JavaScript (jshint).
## Usage:       sudo ./vim.sh <login-user>
## Parameters:  $1  <login-user>  Non-root desktop username (e.g. maxmin)
##

source /tmp/common.sh

LOGIN_USER="${1:-}"
require_login_user "${LOGIN_USER}"
HOME_DIR=$(eval echo "~${LOGIN_USER}")
cd "${HOME_DIR}"

####
STEP "Vim"
####

dnf install -y vim

if [[ ! -f .vimrc ]]
then
    touch .vimrc
    chown "${LOGIN_USER}":"${LOGIN_USER}" .vimrc
fi

####
STEP "Pathogen"
####

mkdir -p .vim/{autoload,bundle}
chown -R "${LOGIN_USER}":"${LOGIN_USER}" .vim

if [[ ! -d .vim/bundle/vim-pathogen ]]
then
    git clone https://github.com/tpope/vim-pathogen.git .vim/bundle/vim-pathogen
fi

if [[ ! -f .vim/autoload/pathogen.vim ]]
then
    wget https://tpo.pe/pathogen.vim -O .vim/autoload/pathogen.vim
fi

if [[ -z "$(grep pathogen .vimrc)" ]]
then
cat <<-EOT >> .vimrc
	execute pathogen#infect()
	syntax on
	filetype plugin indent on
	Helptags
EOT
fi

log_info 'Pathogen installed.'

####
STEP "Syntastic"
####

if [[ ! -d .vim/bundle/syntastic ]]
then
    git clone https://github.com/vim-syntastic/syntastic.git .vim/bundle/syntastic
fi

####
STEP "Bash ShellCheck"
####

dnf install -y ShellCheck

if [[ -z "$(grep shellcheck .vimrc)" ]]
then
cat <<-EOT >> .vimrc
	let g:syntastic_sh_checkers = ['shellcheck']
EOT
fi

log_info 'Bash ShellCheck enabled.'

####
STEP "Perl perlcritic"
####

dnf install -y perl-Perl-Critic

if [[ -z "$(grep perlcritic .vimrc)" ]]
then
cat <<-EOT >> .vimrc
	let g:syntastic_enable_perl_checkers = 1
	let g:syntastic_perl_checkers = ['perl','perlcritic']
EOT
fi

log_info 'Perl perlcritic enabled.'

####
STEP "Python pylint"
####

dnf install -y pylint

if [[ -z "$(grep pylint .vimrc)" ]]
then
cat <<-EOT >> .vimrc
	let g:syntastic_python_checkers = ['pylint']
EOT
fi

log_info 'Python pylint enabled.'

####
STEP "JavaScript jshint"
####

dnf install -y npm

if ! npm list -g jshint > /dev/null 2>&1
then
    npm install jshint -g
fi

if [[ -z "$(grep jshint .vimrc)" ]]
then
cat <<-EOT >> .vimrc
	let g:syntastic_javascript_checkers = ['jshint']
EOT
fi

log_info 'JavaScript jshint enabled.'

log_info "Open    : vim <file>"
log_info "Check   : :SyntasticCheck  (run linter manually)"
log_info "Errors  : :Errors          (open error list)"
log_info "Config  : ${HOME_DIR}/.vimrc"
