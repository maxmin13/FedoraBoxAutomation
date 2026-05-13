#!/bin/bash

##
## Description: Installs Ansible via dnf.
## Usage:       sudo ./ansible.sh
## Parameters:  none
##

source /tmp/common.sh

####
STEP "Ansible"
####

if command -v ansible > /dev/null 2>&1
then
    log_info "Ansible already installed: $(ansible --version | head -1)"
else
    dnf install -y ansible
    log_info "Ansible installed: $(ansible --version | head -1)"
fi

log_info "Run a playbook : ansible-playbook <playbook.yml>"
log_info "Check version  : ansible --version"
log_info "List modules   : ansible-doc -l"
