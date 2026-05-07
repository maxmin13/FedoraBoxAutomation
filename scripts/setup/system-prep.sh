#!/bin/bash

##
## Description: Prepares a fresh Fedora installation for use with VirtualBox.
##              Removes unused software (LibreOffice, Firefox, libvirt/QEMU),
##              runs a full system update, and prints the running kernel version.
## Usage:       sudo ./system-prep.sh <login-user>
## Parameters:  $1  <login-user>  Non-root desktop username (e.g. maxmin)
##

source /tmp/common.sh

if [[ 0 -eq $# ]]
then
   log_error 'login user not found.'
   exit 1
fi

LOGIN_USER="${1}"
HOME_DIR=$(eval echo "~${LOGIN_USER}")
cd "${HOME_DIR}"

####
STEP "Unused software"
####

dnf remove -y libreoffice* firefox
log_info 'Removed libreoffice, firefox.'

if nmcli connection show virbr0 > /dev/null 2>&1
then
   nmcli connection delete virbr0
   log_info 'virbr0 network connection deleted.'
fi

if nmcli device show virbr0 > /dev/null 2>&1
then
   nmcli device delete virbr0
   log_info 'virbr0 network device deleted.'
fi

if systemctl is-active libvirtd.service > /dev/null 2>&1
then
   systemctl stop libvirtd.service
   systemctl disable libvirtd.service
else
   log_info 'libvirtd service not active.'
fi

dnf remove -y qemu-kvm.x86_64
log_info 'libvirt library removed.'

dnf autoremove -y
log_info 'Unused software removed.'

####
STEP "System update"
####

dnf -y update

####
STEP "Kernel"
####

dnf install -y kernel-devel-$(uname -r) kernel-headers gcc make perl bzip2
uname -r

log_info 'System configured.'
