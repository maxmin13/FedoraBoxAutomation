#!/bin/bash

##
## Description: Downloads and installs Eclipse IDE for Java Developers to /opt/eclipse
##              and registers a GNOME desktop entry. Optionally pass a release as the
##              first argument (default: 2026-03).
## Usage:       sudo ./eclipse.sh [release]
## Parameters:  $1  [release]  Eclipse release to install (default: 2026-03)
##

source /tmp/common.sh

ECLIPSE_RELEASE="${1:-2026-03}"
ECLIPSE_DIR="/opt/eclipse-${ECLIPSE_RELEASE}"

####
STEP "Eclipse"
####

if [[ -d "${ECLIPSE_DIR}" && ! -x "${ECLIPSE_DIR}/eclipse" ]]
then
    log_warn "Incomplete Eclipse installation found. Removing ${ECLIPSE_DIR} ..."
    rm -rf "${ECLIPSE_DIR}"
    rm -f /usr/bin/eclipse /usr/share/applications/eclipse.desktop
fi

if [[ -x "${ECLIPSE_DIR}/eclipse" ]]
then
    log_info "Eclipse ${ECLIPSE_RELEASE} already installed."
else
    WORK_DIR=$(mktemp -d)
    trap 'rm -rf "${WORK_DIR}"' EXIT

    log_info "Downloading Eclipse ${ECLIPSE_RELEASE} ..."
    wget "https://download.eclipse.org/technology/epp/downloads/release/${ECLIPSE_RELEASE}/R/eclipse-jee-${ECLIPSE_RELEASE}-R-linux-gtk-x86_64.tar.gz" -O "${WORK_DIR}/eclipse.tar.gz"
    log_info "Download complete. Extracting ..."
    tar -xf "${WORK_DIR}/eclipse.tar.gz" --directory /opt
    mv /opt/eclipse "${ECLIPSE_DIR}"
    ln -sf "${ECLIPSE_DIR}/eclipse" /usr/bin/eclipse
    log_info "Extraction complete."

    cat <<-EOF > /usr/share/applications/eclipse.desktop
	[Desktop Entry]
	Encoding=UTF-8
	Name=Eclipse IDE
	Comment=Eclipse IDE for Java Developers
	Exec=/usr/bin/eclipse
	Icon=${ECLIPSE_DIR}/icon.xpm
	Categories=Application;Development;Java;IDE
	Type=Application
	Terminal=0
	EOF

    log_info 'Eclipse desktop entry registered.'
    log_info "Eclipse ${ECLIPSE_RELEASE} successfully installed."
fi

log_info "Launch  : eclipse &   or open Applications menu"
log_info "Install : ${ECLIPSE_DIR}"
