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
   log_error 'network parameters not found.'
   exit 1
fi

HOSTNAME="${1}"

STEP 'Hostname'

current_hostname="$(nmcli general hostname)"

if [[ "${HOSTNAME}" != "${current_hostname}" ]]
then
   nmcli general hostname "${HOSTNAME}"
   log_info 'Hostname set.'
fi

current_hostname="$(nmcli general hostname)"
log_info "Hostname: ${current_hostname}"

STEP 'Connections'

nmcli connection

STEP 'Devices'

nmcli device
echo
ip address

STEP 'Route table'

ip -r route
