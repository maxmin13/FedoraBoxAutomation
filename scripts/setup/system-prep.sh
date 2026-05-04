#!/bin/bash

##
## Description: Prepares a fresh Fedora installation for use with VirtualBox.
##              Removes unused software (LibreOffice, Firefox, libvirt/QEMU),
##              runs a full system update, and prints the running kernel version.
## Usage:       sudo ./system-prep.sh <login-user>
##

set -o errexit
set -o pipefail
set -o nounset
set +o xtrace

exec > >(tee -a /var/log/fedora-box-automation.log) 2>&1

STEP() { echo ; echo ; echo "==\\" ; echo "===>" "$@" ; echo "==/" ; echo ; }

if [[ 0 -eq $# ]] 
then
   echo 'ERROR: login user not found.'
   exit 1
fi

LOGIN_USER="${1}"
cd /home/"${LOGIN_USER}"

####
STEP "Unused software"
####

dnf remove -y libreoffice* firefox

echo 'Removed libreoffice, firefox.'

if nmcli connection show virbr0 > /dev/null
then
   nmcli connection delete virbr0
   
   echo 'virbr0 network connection deleted'
fi

if nmcli device show virbr0 > /dev/null
then
   nmcli device delete virbr0
   
   echo 'virbr0 network device deleted'
fi

if systemctl is-active libvirtd.service > /dev/null
then
   systemctl stop libvirtd.service
   systemctl disable libvirtd.service
else
   echo 'libvirtd service not active.'
fi

dnf remove -y qemu-kvm.x86_64

echo 'libvirt library removed'

dnf autoremove -y

echo 'Unused software removed.'

####
STEP "System update"
####

dnf -y update

####
STEP "Kernel"
####

# needed to install Virtualbox
#####dnf install -y kernel-devel-matched
uname -r

echo 'System configured.'