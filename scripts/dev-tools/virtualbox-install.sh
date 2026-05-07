#!/bin/bash

##
## Description: Installs VirtualBox 6.1.26 and its Extension Pack on Fedora
##              by downloading the RPM from the official VirtualBox CDN.
## Usage:       sudo ./virtualbox-install.sh
##

source /tmp/common.sh

####VBOX_DOWNLOAD_URL='https://download.virtualbox.org/virtualbox/6.1.30/VirtualBox-6.1-6.1.30_148432_fedora33-1.x86_64.rpm'
####VBOX_EXTPACK_DOWNLOAD_URL='https://download.virtualbox.org/virtualbox/6.1.30/Oracle_VM_VirtualBox_Extension_Pack-6.1.30.vbox-extpack'
VBOX_DOWNLOAD_URL='https://download.virtualbox.org/virtualbox/6.1.26/VirtualBox-6.1-6.1.26_145957_fedora33-1.x86_64.rpm'
VBOX_EXTPACK_DOWNLOAD_URL='https://download.virtualbox.org/virtualbox/6.1.26/Oracle_VM_VirtualBox_Extension_Pack-6.1.26-145957.vbox-extpack'
TEMP_DIR='/opt/temp'

trap 'rm -rf "${TEMP_DIR}"' EXIT
mkdir -p "${TEMP_DIR}" && cd "${TEMP_DIR}" || exit

####
STEP "Installing development-tools"
####

dnf -y install @development-tools
dnf install -y perl gcc dkms kernel-devel kernel-headers make bzip2
dnf -y install kernel-headers kernel-devel dkms elfutils-libelf-devel qt5-qtx11extras
dnf install -y SDL*

####
STEP "Installing Virtualbox"
####

if vboxmanage -v > /dev/null 2>&1
then
   echo 'Virtualbox already installed.'
else
   vbox_file='virtualbox.rpm'
   wget "${VBOX_DOWNLOAD_URL}" -O "${vbox_file}"
   chmod +x "${vbox_file}"
   rpm -i "${vbox_file}"

   vboxmanage -v

   ####
   STEP "Installing Virtualbox extension pack"
   ####

   wget "${VBOX_EXTPACK_DOWNLOAD_URL}"
   ext_file="$(basename "${VBOX_EXTPACK_DOWNLOAD_URL}")"
   chmod +x "${ext_file}"
   echo "y" | vboxmanage extpack install "${ext_file}"
fi

exit 0