#!/bin/bash

set -o errexit
set -o pipefail
set -o nounset
set +o xtrace

STEP() { echo ; echo ; echo "==\\" ; echo "===>" "$@" ; echo "==/" ; echo ; }

####VBOX_DOWNLOAD_URL='https://download.virtualbox.org/virtualbox/6.1.30/VirtualBox-6.1-6.1.30_148432_fedora33-1.x86_64.rpm'
####VBOX_EXTPACK_DOWNLOAD_URL='https://download.virtualbox.org/virtualbox/6.1.30/Oracle_VM_VirtualBox_Extension_Pack-6.1.30.vbox-extpack'
VBOX_DOWNLOAD_URL='https://download.virtualbox.org/virtualbox/6.1.26/VirtualBox-6.1-6.1.26_145957_fedora33-1.x86_64.rpm'
VBOX_EXTPACK_DOWNLOAD_URL='https://download.virtualbox.org/virtualbox/6.1.26/Oracle_VM_VirtualBox_Extension_Pack-6.1.26-145957.vbox-extpack'
TEMP_DIR='/opt/temp'

trap 'rm -rf ${TEMP_DIR:?}' EXIT
mkdir -p "${TEMP_DIR}" && cd "${TEMP_DIR}" || exit

cd "${TEMP_DIR}"

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

set +e
vboxmanage -v
exit_code=$?
set -e

if [[ 0 -eq "${exit_code}" ]]
then
   echo 'Virtualbox already installed.'
else 
   set +e
   
   vbox_file='virtualbox.rpm'
   wget "${VBOX_DOWNLOAD_URL}" -O "${vbox_file}"
   chmod +x "${vbox_file}"
   rpm -i "${vbox_file}"
   
   vboxmanage -v
   
  # echo
  # echo 'Running /sbin/vboxconfig'
  # /sbin/vboxconfig
  # echo '/sbin/vboxconfig run'
  # echo
   
   ####
   STEP "Installing Virtualbox extension pack"
   ####   
   
   wget "${VBOX_EXTPACK_DOWNLOAD_URL}" 
   ext_file="$(basename "${VBOX_EXTPACK_DOWNLOAD_URL}")"
   chmod +x "${ext_file}"
   echo "y" | vboxmanage extpack install "${ext_file}"
   
   set -e
fi

exit 0