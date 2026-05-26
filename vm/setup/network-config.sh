#!/bin/bash

##
## Description: Sets the system hostname and prints a summary of network
##              connections, devices, IP addresses, and the routing table.
## Usage:       sudo ./network-config.sh <hostname>
## Parameters:  $1  <hostname>  Hostname to assign to the VM
##

source /tmp/common.sh

if [[ 1 -gt $# ]]
then
   log_error 'Hostname argument is required. Usage: network-config.sh <hostname>'
   exit 1
fi

HOSTNAME="${1}"

STEP "Hostname"

current_hostname="$(nmcli general hostname)"
log_info "Current hostname : ${current_hostname}"
log_info "Requested hostname: ${HOSTNAME}"

if [[ "${HOSTNAME}" == "${current_hostname}" ]]
then
   log_info 'Hostname already set, skipping.'
else
   nmcli general hostname "${HOSTNAME}"
   current_hostname="$(nmcli general hostname)"
   log_info "Hostname changed to: ${current_hostname}"
fi

STEP "Connections"

log_info "Active network connections:"
nmcli connection

STEP "Devices"

log_info "Network devices:"
nmcli device

log_info "IP addresses:"
ip address

STEP "Route table"

log_info "Routing table:"
ip -r route
