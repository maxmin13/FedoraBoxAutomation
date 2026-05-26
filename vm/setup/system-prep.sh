#!/bin/bash

##
## Description: Prepares a fresh Fedora installation for use with VirtualBox.
##              Removes unused software (LibreOffice, Firefox, libvirt/QEMU),
##              enables RPM Fusion repositories, runs a full system update,
##              and prints the running kernel version.
## Usage:       sudo ./system-prep.sh <login-user>
## Parameters:  $1  <login-user>  Non-root desktop username (e.g. maxmin)
##

source /tmp/common.sh

LOGIN_USER="${1:-}"
require_login_user "${LOGIN_USER}"
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
STEP "RPM Fusion repositories"
####

FEDORA_VERSION=$(rpm -E %fedora)

if ! rpm -q rpmfusion-free-release &>/dev/null
then
    dnf install -y "https://mirrors.rpmfusion.org/free/fedora/rpmfusion-free-release-${FEDORA_VERSION}.noarch.rpm"
    log_info 'RPM Fusion free repository enabled.'
else
    log_info 'RPM Fusion free already enabled.'
fi

if ! rpm -q rpmfusion-nonfree-release &>/dev/null
then
    dnf install -y "https://mirrors.rpmfusion.org/nonfree/fedora/rpmfusion-nonfree-release-${FEDORA_VERSION}.noarch.rpm"
    log_info 'RPM Fusion nonfree repository enabled.'
else
    log_info 'RPM Fusion nonfree already enabled.'
fi

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
