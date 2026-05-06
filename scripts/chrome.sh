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

dnf install -y fedora-workstation-repositories
dnf config-manager --enable google-chrome
dnf install -y google-chrome-stable

