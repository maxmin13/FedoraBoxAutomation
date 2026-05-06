#!/bin/bash

##
## Description: Installs Wireshark and adds the login user to the wireshark
##              group to allow packet capture without root.
## Usage:       sudo ./wireshark.sh <login-user>
##

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