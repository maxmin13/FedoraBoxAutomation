#!/bin/bash

##
## Description: Installs SELinux audit and troubleshooting tools, then starts
##              the audit daemon. Reports current SELinux enforcement status.
## Usage:       sudo ./selinux-config.sh
##

source /tmp/common.sh

STEP 'selinux'

echo 'selinux audit tools installed.'
echo 'Do you have SELinux enabled?'

sestatus

yum install -y audit setools setroubleshoot setroubleshoot-server policycoreutils-python-utils 
systemctl start auditd

echo 'selinux audit tools installed.'



