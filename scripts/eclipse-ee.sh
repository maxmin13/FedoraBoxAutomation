#!/bin/bash

##
## Description: Downloads the Eclipse Enterprise Edition installer (latest
##              release) to /opt/eclipse-installer. Run the installer manually
##              after download to select the desired Eclipse flavour.
## Usage:       sudo ./eclipse-ee.sh
##

source /tmp/common.sh

####
STEP "Eclipse Enterprise"
####


if [[ -d '/opt/eclipse-installer' ]]
then
    log_info 'Eclipse Enterprise installer already downloaded.'
else
    WORK_DIR=$(mktemp -d)
    trap 'rm -rf "${WORK_DIR}"' EXIT

    ECLIPSE_VERSION=$(curl -sL https://api.github.com/repos/eclipse-packaging/packages/releases/latest | grep -oP '"tag_name":\s*"\K[^"]+')
    wget "https://download.eclipse.org/oomph/epp/${ECLIPSE_VERSION}/R/eclipse-inst-jre-linux64.tar.gz" -O "${WORK_DIR}/eclipse_ee.tar.gz"
    tar -zxf "${WORK_DIR}/eclipse_ee.tar.gz" --directory /opt

    log_info 'Eclipse Enterprise installer downloaded.'
fi

if [[ ! -f /usr/share/applications/eclipse-installer.desktop ]]
then
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
fi
 





