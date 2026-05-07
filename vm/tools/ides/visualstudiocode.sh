#!/bin/bash

##
## Description: Installs Visual Studio Code by adding the Microsoft package
##              repository and installing the 'code' package via dnf.
## Usage:       sudo ./visualstudiocode.sh
## Parameters:  none
##

source /tmp/common.sh

####
STEP "Visual Studio Code"
####

if ! rpm -q code &>/dev/null
then
    rpm --import https://packages.microsoft.com/keys/microsoft.asc
    printf "[vscode]\nname=packages.microsoft.com\nbaseurl=https://packages.microsoft.com/yumrepos/vscode/\nenabled=1\ngpgcheck=1\nrepo_gpgcheck=1\ngpgkey=https://packages.microsoft.com/keys/microsoft.asc\nmetadata_expire=1h" > /etc/yum.repos.d/vscode.repo
    dnf install -y code
    log_info 'Visual Studio Code successfully installed.'
else
    log_info 'Visual Studio Code already installed.'
fi

log_info "Launch : open Applications menu and search for Visual Studio Code"
log_info "         or run: code <folder>"
log_info "Extensions: code --install-extension <publisher.extension>"
