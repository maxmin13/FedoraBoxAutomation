#!/bin/bash

##
## Description: Installs Google Chrome stable on Fedora by enabling the
##              Google Chrome repository via fedora-workstation-repositories.
## Usage:       sudo ./chrome.sh
##

source /tmp/common.sh

####
STEP "Chrome"
####

if rpm -q google-chrome-stable &>/dev/null
then
    log_info 'Google Chrome already installed.'
else
    dnf install -y dnf-plugins-core fedora-workstation-repositories
    dnf config-manager enable google-chrome
    dnf install -y google-chrome-stable
    log_info 'Google Chrome successfully installed.'
fi

