#!/bin/bash

##
## Description: Installs common developer utilities: dconf-editor, expect,
##              gedit, and Ansible.
## Usage:       sudo ./dev-tools.sh
##

set -o errexit
set -o pipefail
set -o nounset
set +o xtrace

STEP() { echo ; echo ; echo "==\\" ; echo "===>" "$@" ; echo "==/" ; echo ; }

####
STEP "Install programs"
####

dnf install -y dconf-editor expect gedit

####
STEP "Install Ansible"
####

dnf install -y ansible