#!/bin/bash

set -o errexit
set -o pipefail
set -o nounset
set +o xtrace

STEP() { echo ; echo ; echo "==\\" ; echo "===>" "$@" ; echo "==/" ; echo ; }

if [[ 0 -eq $# ]] 
then
   echo 'ERROR: login user not found.'
   exit 1
fi

LOGIN_USER="${1}"

####
STEP "Wireshark"
####

dnf install -y wireshark
usermod -a -G wireshark "${LOGIN_USER}"