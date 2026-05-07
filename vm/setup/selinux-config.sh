#!/bin/bash

##
## Description: Installs SELinux audit and troubleshooting tools, then starts
##              the audit daemon. Reports current SELinux enforcement status.
## Usage:       sudo ./selinux-config.sh
## Parameters:  none
##

source /tmp/common.sh

####
STEP "SELinux"
####

log_info 'SELinux status:'
sestatus

if ! rpm -q audit &>/dev/null
then
    dnf install -y audit setools setroubleshoot setroubleshoot-server policycoreutils-python-utils
    log_info 'SELinux audit tools installed.'
else
    log_info 'SELinux audit tools already installed.'
fi

systemctl start auditd

log_info "Status  : sestatus"
log_info "Audit log: /var/log/audit/audit.log"
log_info "Errors  : sealert -a /var/log/audit/audit.log"
