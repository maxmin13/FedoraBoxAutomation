#!/bin/bash

##
## Description: Installs SELinux audit and troubleshooting tools, then starts
##              the audit daemon. Reports current SELinux enforcement status.
## Usage:       sudo ./selinux-config.sh
##

source /tmp/common.sh

STEP 'SELinux'

log_info 'SELinux status:'
sestatus

log_info 'Installing SELinux audit tools ...'
yum install -y audit setools setroubleshoot setroubleshoot-server policycoreutils-python-utils
systemctl start auditd

log_info 'SELinux audit tools installed.'
