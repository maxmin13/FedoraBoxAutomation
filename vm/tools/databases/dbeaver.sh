#!/bin/bash

##
## Description: Installs DBeaver Community Edition, a free universal database
##              GUI client supporting MariaDB, PostgreSQL, and most other databases.
##              Downloads the latest RPM directly from the DBeaver GitHub releases.
## Usage:       sudo ./dbeaver.sh
## Parameters:  none
##

source /tmp/common.sh

####
STEP "DBeaver Community"
####

if ! rpm -q dbeaver-ce &>/dev/null
then
    log_info 'Installing DBeaver Community Edition ...'

    WORK_DIR=$(mktemp -d)
    trap 'rm -rf "${WORK_DIR}"' EXIT

    RPM_URL=$(curl -sL https://api.github.com/repos/dbeaver/dbeaver/releases/latest | grep '"browser_download_url"' | grep 'x86_64\.rpm' | head -1 | sed 's/.*"browser_download_url": *"\([^"]*\)".*/\1/' || true)
    if [[ -z "${RPM_URL}" ]]; then
        log_error 'Could not determine DBeaver RPM download URL.'
        exit 1
    fi
    log_info "Downloading: ${RPM_URL}"

    wget -q "${RPM_URL}" -O "${WORK_DIR}/dbeaver.rpm"
    dnf install -y "${WORK_DIR}/dbeaver.rpm"

    log_info 'DBeaver Community Edition successfully installed.'
else
    log_info 'DBeaver already installed.'
fi

log_info "Launch   : open Applications menu and search for DBeaver"
log_info "           or run: dbeaver &"
log_info "Supports : MariaDB, PostgreSQL, SQLite, Oracle, and more"
