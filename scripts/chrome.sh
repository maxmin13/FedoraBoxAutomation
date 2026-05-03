#!/bin/bash

set -o errexit
set -o pipefail
set -o nounset
set +o xtrace

STEP() { echo ; echo ; echo "==\\" ; echo "===>" "$@" ; echo "==/" ; echo ; }

####
STEP "Chrome"
####

dnf install -y fedora-workstation-repositories
dnf config-manager --enable google-chrome
dnf install -y google-chrome-stable

