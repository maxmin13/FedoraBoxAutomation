#!/bin/bash

##
## Description: Downloads the Eclipse Enterprise Edition installer to
##              /opt/eclipse-installer. Once downloaded, launch the installer
##              manually at /opt/eclipse-installer/eclipse-inst to select and
##              install the desired Eclipse flavour. Optionally pass a release
##              as the first argument (default: 2026-03).
## Usage:       sudo ./eclipse-ee.sh [release]
## Parameters:  $1  [release]  Eclipse release to install (default: 2026-03)
##

source /tmp/common.sh

ECLIPSE_RELEASE="${1:-2026-03}"

####
STEP "Eclipse Enterprise"
####

if [[ -d '/opt/eclipse-installer' && ! -x '/opt/eclipse-installer/eclipse-inst' ]]
then
    log_warn 'Incomplete Eclipse installer found. Removing /opt/eclipse-installer ...'
    rm -rf /opt/eclipse-installer
    rm -f /usr/share/applications/eclipse-installer.desktop
fi

if [[ -x '/opt/eclipse-installer/eclipse-inst' ]]
then
    log_info 'Eclipse Enterprise installer already downloaded.'
else
    log_info "Downloading Eclipse Enterprise installer ${ECLIPSE_RELEASE} ..."

    WORK_DIR=$(mktemp -d)
    trap 'rm -rf "${WORK_DIR}"' EXIT

    wget --progress=dot "https://download.eclipse.org/oomph/epp/${ECLIPSE_RELEASE}/R/eclipse-inst-jre-linux64.tar.gz" -O "${WORK_DIR}/eclipse_ee.tar.gz"
    log_info "Download complete. Extracting ..."
    tar -xf "${WORK_DIR}/eclipse_ee.tar.gz" --directory /opt
    log_info "Extraction complete."

    cat <<-EOF > /usr/share/applications/eclipse-installer.desktop
	[Desktop Entry]
	Encoding=UTF-8
	Name=Eclipse Installer
	Comment=Eclipse Enterprise Edition Installer
	Exec=/opt/eclipse-installer/eclipse-inst
	Icon=/opt/eclipse-installer/eclipse-inst.png
	Categories=Application;Development;Java;IDE
	Type=Application
	Terminal=0
	EOF

    log_info 'Eclipse Enterprise installer desktop entry registered.'
    log_info "Eclipse Enterprise installer ${ECLIPSE_RELEASE} successfully downloaded."
fi
