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
log_info 'dconf-editor, expect, gedit installed.'

####
STEP "Install Ansible"
####

dnf install -y ansible
log_info 'Ansible installed.'