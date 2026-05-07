#!/bin/bash

##
## Description: Installs Git via dnf.
## Usage:       sudo ./git.sh
## Parameters:  none
##

source /tmp/common.sh

####
STEP "Git"
####

if ! rpm -q git &>/dev/null
then
    dnf install -y git
    log_info "Git installed: $(git --version)"
else
    log_info "Git already installed: $(git --version 2>/dev/null)"
fi

log_info "Version    : git --version"
log_info "Clone      : git clone <url>"
log_info "Status     : git status"
log_info "Set name   : git config --global user.name \"Your Name\""
log_info "Set email  : git config --global user.email \"you@example.com\""
log_info "View config: git config --list"
