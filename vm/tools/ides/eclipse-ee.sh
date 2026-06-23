#!/bin/bash

##
## Description: Downloads the Eclipse Enterprise Edition installer to
##              /opt/eclipse-installer. Once downloaded, launch the installer
##              manually at /opt/eclipse-installer/eclipse-inst to select and
##              install the desired Eclipse flavour.
##              Pass 'latest' to auto-resolve the current release from the Eclipse EPP downloads page.
## Usage:       sudo ./eclipse-ee.sh <release>
## Parameters:  $1  <release>  Eclipse release to install (e.g. 2026-03) or 'latest'
##

source /tmp/common.sh

if [[ -z "${1:-}" ]]; then
    log_error "Eclipse release argument is required (e.g. 2026-03 or 'latest')"
    exit 1
fi
ECLIPSE_RELEASE="$1"

if [[ "${ECLIPSE_RELEASE}" == 'latest' ]]; then
    log_info "Querying Eclipse EPP downloads for the latest release ..."
    epp_page=$(curl -fsSL "https://download.eclipse.org/technology/epp/downloads/release/") || {
        log_error "Could not reach Eclipse EPP downloads page — check VM network."
        exit 1
    }
    ECLIPSE_RELEASE=$(echo "${epp_page}" \
        | grep -Eo 'release/[0-9]{4}-[0-9]{2}' \
        | grep -Eo '[0-9]{4}-[0-9]{2}' \
        | sort -r | head -1 || true)
    if [[ -z "${ECLIPSE_RELEASE}" ]]; then
        log_error "Could not parse latest Eclipse release from downloads page."
        exit 1
    fi
    log_info "Latest release: ${ECLIPSE_RELEASE}"
fi

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
    log_info 'Eclipse Enterprise installer already installed.'
else
    ECLIPSE_EE_URL="https://download.eclipse.org/oomph/epp/${ECLIPSE_RELEASE}/R/eclipse-inst-jre-linux64.tar.gz"
    log_info "Downloading Eclipse Enterprise installer ${ECLIPSE_RELEASE} from ${ECLIPSE_EE_URL} ..."

    WORK_DIR=$(mktemp -d)
    trap 'rm -rf "${WORK_DIR}"' EXIT

    wget -q --tries=3 "${ECLIPSE_EE_URL}" -O "${WORK_DIR}/eclipse_ee.tar.gz"
    gzip -t "${WORK_DIR}/eclipse_ee.tar.gz" 2>/dev/null || {
        log_error "Eclipse Enterprise installer archive is corrupt or the download was incomplete. Check the release name and network connectivity."
        exit 1
    }
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

log_info "Launch installer: /opt/eclipse-installer/eclipse-inst"
log_info "                  or open Applications menu and search for Eclipse Installer"
