#!/bin/bash

##
## Description: Installs Ansible via dnf.
## Usage:       sudo ./ansible.sh
## Parameters:  none
##

source /tmp/common.sh

####
STEP "Prerequisites"
####

if ! command -v python3 > /dev/null 2>&1
then
    log_error 'Python 3 is required but not found. Run python.sh first.'
    exit 1
fi
log_info "Python: $(python3 --version)"

if ! curl -sf --max-time 5 https://mirrors.fedoraproject.org > /dev/null 2>&1
then
    log_warn 'Fedora mirrors unreachable — install may fail if repos are inaccessible.'
fi

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
