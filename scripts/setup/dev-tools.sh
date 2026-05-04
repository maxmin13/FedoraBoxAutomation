#!/bin/bash

##
## Description: Installs common developer utilities: dconf-editor, expect,
##              gedit, and Ansible.
## Usage:       sudo ./dev-tools.sh
##

source /tmp/common.sh

####
STEP "Install programs"
####

dnf install -y dconf-editor expect gedit

####
STEP "Install Ansible"
####

dnf install -y ansible