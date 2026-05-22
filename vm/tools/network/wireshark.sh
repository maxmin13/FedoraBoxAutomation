#!/bin/bash

##
## Description: Installs Wireshark and adds the login user to the wireshark
##              group to allow packet capture without root.
## Usage:       sudo ./wireshark.sh <login-user>
## Parameters:  $1  <login-user>  Non-root desktop username (e.g. maxmin)
##

source /tmp/common.sh

LOGIN_USER="${1:-}"
require_login_user "${LOGIN_USER}"

####
STEP "Wireshark"
####

if ! rpm -q wireshark &>/dev/null
then
    dnf install -y wireshark
    log_info 'Wireshark installed.'
else
    log_info 'Wireshark already installed.'
fi

if ! id -nG "${LOGIN_USER}" | grep -q wireshark
then
    usermod -aG wireshark "${LOGIN_USER}"
    log_info "${LOGIN_USER} added to wireshark group."
else
    log_info "${LOGIN_USER} already in wireshark group."
fi

log_info "Launch   : open Applications menu and search for Wireshark"
log_info "           or run: wireshark &"
log_info "Capture  : select a network interface and click the shark fin"
log_info "Filter   : http | tcp | ip.addr == 192.168.1.1"
log_warn "NOTE: Log out and back in for wireshark group membership to take effect."
