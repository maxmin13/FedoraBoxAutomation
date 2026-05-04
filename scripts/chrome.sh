#!/bin/bash

source /tmp/common.sh

####
STEP "Chrome"
####

dnf install -y fedora-workstation-repositories
dnf config-manager --enable google-chrome
dnf install -y google-chrome-stable

