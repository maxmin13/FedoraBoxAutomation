#!/bin/bash

##
## Description: Installs VirtualBox Guest Additions from the attached ISO.
##              Installs kernel build tools, mounts the GA ISO from the
##              optical drive (/dev/sr1 or /dev/sr0), and runs the installer.
## Usage:       sudo ./guest-additions.sh
## Parameters:  none
##

source /tmp/common.sh

####
STEP "Build dependencies"
####

dnf install -y dkms "kernel-devel-$(uname -r)" kernel-headers gcc make perl bzip2
log_info 'Build dependencies installed.'

####
STEP "Mount Guest Additions ISO"
####

mkdir -p /mnt/ga

mounted=0
for dev in /dev/sr1 /dev/sr0; do
    if mount "$dev" /mnt/ga 2>/dev/null; then
        log_info "Mounted from ${dev}."
        mounted=1
        break
    fi
done

if [[ "${mounted}" -eq 0 ]]; then
    log_error 'Could not mount Guest Additions ISO from /dev/sr0 or /dev/sr1.'
    log_error 'Make sure the VBoxGuestAdditions ISO is attached to the VM optical drive.'
    exit 1
fi

####
STEP "Install Guest Additions"
####

set +e
/mnt/ga/VBoxLinuxAdditions.run
exit_code=$?
set -e

umount /mnt/ga || true

# Exit code 2 means already installed with same version - treat as success
if [[ "${exit_code}" -ne 0 ]] && [[ "${exit_code}" -ne 2 ]]; then
    log_error "VBoxLinuxAdditions.run failed (exit ${exit_code})."
    exit 1
fi

log_info 'Guest Additions installed. Reboot the VM to activate.'
