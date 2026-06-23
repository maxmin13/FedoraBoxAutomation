#!/bin/bash

##
## Description: Downloads and installs IntelliJ IDEA Community Edition to
##              /opt/idea-IC-<version> and registers a GNOME desktop entry.
##              Multiple versions can coexist.
##              Pass 'latest' to auto-resolve the current version from the JetBrains API.
## Usage:       sudo ./intellij.sh <version>
## Parameters:  $1  <version>  IntelliJ IDEA CE version to install (e.g. 2025.1.2) or 'latest'
##

source /tmp/common.sh

if [[ -z "${1:-}" ]]; then
    log_error "IntelliJ IDEA version argument is required (e.g. 2025.1.2 or 'latest')"
    exit 1
fi
IDEA_VERSION="$1"
IDEA_URL=""

if [[ "${IDEA_VERSION}" == 'latest' ]]; then
    log_info "Querying JetBrains API for the latest IntelliJ IDEA Community release ..."
    RELEASE_JSON=$(curl -fsSL "https://data.services.jetbrains.com/products/releases?code=IIC&latest=true&type=release")
    IDEA_VERSION=$(python3 -c "
import sys, json
d = json.loads(sys.stdin.read())
print(d['IIC'][0]['version'])
" <<< "${RELEASE_JSON}")
    IDEA_URL=$(python3 -c "
import sys, json
d = json.loads(sys.stdin.read())
print(d['IIC'][0]['downloads']['linux']['link'])
" <<< "${RELEASE_JSON}")
    if [[ -z "${IDEA_VERSION}" || -z "${IDEA_URL}" ]]; then
        log_error "Could not determine the latest IntelliJ IDEA version. Check network connectivity."
        exit 1
    fi
    log_info "Latest version: ${IDEA_VERSION}"
fi

IDEA_DIR="/opt/idea-IC-${IDEA_VERSION}"
IDEA_BIN="/usr/bin/idea"
IDEA_DESKTOP="/usr/share/applications/intellij-idea-ce.desktop"
CACHE_DIR="/opt/intellij-cache"

####
STEP "IntelliJ IDEA Community Edition"
####

if [[ -d "${IDEA_DIR}" && ! -x "${IDEA_DIR}/bin/idea.sh" ]]; then
    log_warn "Incomplete IntelliJ IDEA installation found. Removing ${IDEA_DIR} ..."
    rm -rf "${IDEA_DIR}"
    rm -f "${IDEA_BIN}" "${IDEA_DESKTOP}"
fi

if [[ -x "${IDEA_DIR}/bin/idea.sh" ]]; then
    log_info "IntelliJ IDEA Community ${IDEA_VERSION} already installed."
else
    mkdir -p "${CACHE_DIR}"
    CACHED_TAR="${CACHE_DIR}/ideaIC-${IDEA_VERSION}.tar.gz"
    IDEA_URL="${IDEA_URL:-https://download.jetbrains.com/idea/ideaIC-${IDEA_VERSION}.tar.gz}"

    if [[ ! -f "${CACHED_TAR}" ]]; then
        log_info "Downloading IntelliJ IDEA Community ${IDEA_VERSION} from ${IDEA_URL} ..."
        wget -q --tries=3 "${IDEA_URL}" -O "${CACHED_TAR}"
        gzip -t "${CACHED_TAR}" 2>/dev/null || {
            rm -f "${CACHED_TAR}"
            log_error "IntelliJ IDEA ${IDEA_VERSION} archive is corrupt or the download was incomplete. Check the version number and network connectivity."
            exit 1
        }
        log_info "Download complete. Cached at ${CACHED_TAR}."
    else
        log_info "Using cached archive: ${CACHED_TAR}"
    fi

    log_info "Extracting ..."
    EXTRACT_TMP=$(mktemp -d)
    tar -xf "${CACHED_TAR}" --directory "${EXTRACT_TMP}"
    EXTRACTED_DIR=$(find "${EXTRACT_TMP}" -maxdepth 1 -mindepth 1 -type d | head -1)
    if [[ -z "${EXTRACTED_DIR}" ]]; then
        rm -rf "${EXTRACT_TMP}"
        rm -f "${CACHED_TAR}"
        log_error "Extraction produced no directory - archive may be corrupt. Cache cleared; re-run to re-download."
        exit 1
    fi
    mv "${EXTRACTED_DIR}" "${IDEA_DIR}"
    rm -rf "${EXTRACT_TMP}"
    ln -sf "${IDEA_DIR}/bin/idea.sh" "${IDEA_BIN}"
    log_info "Extraction complete."

    # IntelliJ monitors a large number of files - raise inotify limit if not already set
    if ! grep -qr 'fs.inotify.max_user_watches' /etc/sysctl.conf /etc/sysctl.d/ 2>/dev/null; then
        echo 'fs.inotify.max_user_watches = 524288' > /etc/sysctl.d/99-intellij.conf
        sysctl --load /etc/sysctl.d/99-intellij.conf
        log_info "inotify watches limit set to 524288."
    fi

    cat <<-EOF > "${IDEA_DESKTOP}"
	[Desktop Entry]
	Version=1.0
	Type=Application
	Name=IntelliJ IDEA Community Edition
	Comment=Intelligent Java IDE
	Exec=${IDEA_BIN} %f
	Icon=${IDEA_DIR}/bin/idea.svg
	Categories=Development;IDE;Java;
	Terminal=false
	StartupWMClass=jetbrains-idea-ce
	EOF

    update-desktop-database /usr/share/applications
    log_info "Desktop entry registered."
    log_info "IntelliJ IDEA Community ${IDEA_VERSION} successfully installed."
fi

log_info "Launch  : idea  or open Applications menu"
log_info "Install : ${IDEA_DIR}"
