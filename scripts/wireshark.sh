#!/bin/bash

source /tmp/common.sh

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