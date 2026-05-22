#!/bin/bash
# Installs VirtualBox Guest Additions from the attached ISO.
# Requires: kernel-devel build tools, GA ISO attached to the VM, and root access.
set -euo pipefail
source /tmp/common.sh 2>/dev/null || true

log() { echo "[guest-additions] $*"; }
error() { echo "[guest-additions] ERROR: $*" >&2; }

log "Installing kernel-devel and build tools for running kernel ($(uname -r))..."
dnf install -y dkms "kernel-devel-$(uname -r)" kernel-headers gcc make perl bzip2

log "Disabling SELinux..."
sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config

log "Mounting Guest Additions ISO..."
mkdir -p /mnt/ga

mounted=0
for dev in /dev/sr1 /dev/sr0; do
    if mount "$dev" /mnt/ga 2>/dev/null; then
        log "Mounted from $dev"
        mounted=1
        break
    fi
done

if [ "$mounted" -eq 0 ]; then
    error "Could not mount Guest Additions ISO from /dev/sr0 or /dev/sr1."
    error "Make sure the VBoxGuestAdditions ISO is attached to the VM optical drive."
    exit 1
fi

log "Running VBoxLinuxAdditions.run..."
set +e
/mnt/ga/VBoxLinuxAdditions.run
exit_code=$?
set -e

umount /mnt/ga || true

# Exit code 2 means "already installed with same version" — treat as success
if [ "$exit_code" -ne 0 ] && [ "$exit_code" -ne 2 ]; then
    error "VBoxLinuxAdditions.run failed (exit $exit_code)"
    exit 1
fi

log "Guest Additions installed. Reboot the VM to activate."
