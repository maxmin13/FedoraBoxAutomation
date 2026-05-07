#!/bin/bash

##
## Description: Installs common developer utilities: dconf-editor, expect,
##              gedit, and Ansible.
## Usage:       sudo ./utilities.sh
## Parameters:  none
##

source /tmp/common.sh

####
STEP "Developer utilities"
####

dnf install -y dconf-editor expect gedit
log_info 'dconf-editor, expect, gedit installed.'

####
STEP "Ansible"
####

dnf install -y ansible
log_info 'Ansible installed.'

log_info "ansible       : ansible --version | ansible-playbook <playbook.yml>"
log_info "dconf-editor  : launch from Applications menu to browse GNOME settings"
log_info "gedit         : gedit <file>"
log_info "expect        : automate interactive CLI tools in scripts"
