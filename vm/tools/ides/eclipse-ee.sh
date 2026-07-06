#!/bin/bash

##
## Description: Downloads the Eclipse Enterprise Edition installer to
##              /opt/eclipse-ee-installer-<release>. Multiple releases coexist;
##              /opt/eclipse-ee-installer symlinks to the latest one downloaded.
##              Once downloaded, launch the installer manually at
##              /opt/eclipse-ee-installer/eclipse-inst to select and install the
##              desired Eclipse flavour.
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

INSTALL_DIR="/opt/eclipse-ee-installer-${ECLIPSE_RELEASE}"

####
STEP "Eclipse Enterprise"
####

if [[ -d "${INSTALL_DIR}" && ! -x "${INSTALL_DIR}/eclipse-inst" ]]
then
    log_warn "Incomplete Eclipse installer found. Removing ${INSTALL_DIR} ..."
    rm -rf "${INSTALL_DIR}"
fi

if [[ -x "${INSTALL_DIR}/eclipse-inst" ]]
then
    log_info "Eclipse Enterprise installer ${ECLIPSE_RELEASE} already installed."
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
    # The archive's own top-level directory is always named 'eclipse-installer'
    # (fixed by upstream), regardless of our own INSTALL_DIR naming below.
    # Remove any stale one left by a previous failed run before extracting.
    [[ -d /opt/eclipse-installer && ! -L /opt/eclipse-installer ]] && rm -rf /opt/eclipse-installer
    tar -xf "${WORK_DIR}/eclipse_ee.tar.gz" --directory /opt
    if [[ ! -d /opt/eclipse-installer ]]; then
        log_error "Extraction produced no 'eclipse-installer' directory under /opt — the archive may be corrupt or use an unexpected layout."
        exit 1
    fi
    mv /opt/eclipse-installer "${INSTALL_DIR}"
    log_info "Extraction complete."

    log_info "Eclipse Enterprise installer ${ECLIPSE_RELEASE} successfully downloaded."
fi

ln -sfn "${INSTALL_DIR}" /opt/eclipse-ee-installer
log_info "Symlink: /opt/eclipse-ee-installer -> ${INSTALL_DIR}"

cat <<-EOF > /usr/share/applications/eclipse-installer.desktop
	[Desktop Entry]
	Encoding=UTF-8
	Name=Eclipse Installer
	Comment=Eclipse Enterprise Edition Installer
	Exec=/opt/eclipse-ee-installer/eclipse-inst
	Icon=/opt/eclipse-ee-installer/eclipse-inst.png
	Categories=Application;Development;Java;IDE
	Type=Application
	Terminal=0
	EOF
log_info 'Eclipse Enterprise installer desktop entry registered.'

log_info "Launch installer: /opt/eclipse-ee-installer/eclipse-inst"
log_info "                  or open Applications menu and search for Eclipse Installer"
log_info ""
log_info "--- What is this? ---"
log_info "'EE' here means the Eclipse Installer (Oomph), historically bundled"
log_info "under the 'Enterprise Edition' EPP package name - it is NOT limited to"
log_info "an enterprise-only flavour. Launching it opens a picker where you"
log_info "choose any Eclipse package yourself (Java, Enterprise Java, C/C++, PHP, ...)."
log_info "This differs from eclipse.sh, which downloads one fixed flavour"
log_info "(Eclipse IDE for Java Developers) directly, with no picker step."
