#!/bin/bash

##
## Description: Installs SELinux audit and troubleshooting tools, then starts
##              the audit daemon. Reports current SELinux enforcement status.
## Usage:       sudo ./selinux-config.sh
##

set -o errexit
set -o pipefail
set -o nounset
set +o xtrace

exec > >(tee -a /var/log/fedora-box-automation.log) 2>&1

STEP() { echo ; echo ; echo "==\\" ; echo "===>" "$@" ; echo "==/" ; echo ; }

STEP 'selinux'

echo 'selinux audit tools installed.'
echo 'Do you have SELinux enabled?'

sestatus

yum install -y audit setools setroubleshoot setroubleshoot-server policycoreutils-python-utils 
systemctl start auditd

echo 'selinux audit tools installed.'



