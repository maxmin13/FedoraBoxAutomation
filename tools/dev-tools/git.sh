#!/bin/bash

##
## Description: Installs Git via dnf.
## Usage:       sudo ./git.sh
##

source /tmp/common.sh

####
STEP "Git"
####

if rpm -q git &>/dev/null
then
    log_info "Git already installed: $(git --version 2>/dev/null)"
else
    dnf install -y git
    log_info "Git installed: $(git --version)"
fi
