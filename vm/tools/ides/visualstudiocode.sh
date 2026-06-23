#!/bin/bash

##
## Description: Downloads and installs Visual Studio Code to
##              /opt/vscode-<version> and registers a GNOME desktop entry.
##              Multiple versions can coexist.
##              Pass 'latest' to auto-resolve the current stable version.
## Usage:       sudo ./visualstudiocode.sh <version>
## Parameters:  $1  <version>  VS Code version to install (e.g. 1.90.0) or 'latest'
##

source /tmp/common.sh

if [[ -z "${1:-}" ]]; then
    log_error "VS Code version argument is required (e.g. 1.90.0 or 'latest')"
    exit 1
fi
VSCODE_VERSION="$1"

if [[ "${VSCODE_VERSION}" == 'latest' ]]; then
    log_info "Querying VS Code update server for the latest stable release ..."
    RELEASE_JSON=$(curl -fsSL "https://update.code.visualstudio.com/api/releases/stable") || {
        log_error "Could not reach VS Code update server — check VM network."
        exit 1
    }
    VSCODE_VERSION=$(python3 -c "import sys, json; print(json.loads(sys.stdin.read())[0])" <<< "${RELEASE_JSON}")
    if [[ -z "${VSCODE_VERSION}" ]]; then
        log_error "Could not determine the latest VS Code version. Check network connectivity."
        exit 1
    fi
    log_info "Latest version: ${VSCODE_VERSION}"
fi

VSCODE_DIR="/opt/vscode-${VSCODE_VERSION}"
VSCODE_BIN="/usr/bin/code-${VSCODE_VERSION}"
VSCODE_DESKTOP="/usr/share/applications/vscode-${VSCODE_VERSION}.desktop"
CACHE_DIR="/opt/vscode-cache"

####
STEP "Visual Studio Code"
####

if [[ -d "${VSCODE_DIR}" && ! -x "${VSCODE_DIR}/bin/code" ]]; then
    log_warn "Incomplete VS Code installation found. Removing ${VSCODE_DIR} ..."
    rm -rf "${VSCODE_DIR}"
    rm -f "${VSCODE_BIN}" "${VSCODE_DESKTOP}"
fi

if [[ -x "${VSCODE_DIR}/bin/code" ]]; then
    log_info "Visual Studio Code ${VSCODE_VERSION} already installed."
else
    mkdir -p "${CACHE_DIR}"
    CACHED_TAR="${CACHE_DIR}/vscode-${VSCODE_VERSION}.tar.gz"
    VSCODE_URL="https://update.code.visualstudio.com/${VSCODE_VERSION}/linux-x64/stable"

    if [[ ! -f "${CACHED_TAR}" ]]; then
        log_info "Downloading Visual Studio Code ${VSCODE_VERSION} ..."
        wget -q --tries=3 "${VSCODE_URL}" -O "${CACHED_TAR}"
        gzip -t "${CACHED_TAR}" 2>/dev/null || {
            rm -f "${CACHED_TAR}"
            log_error "VS Code ${VSCODE_VERSION} archive is corrupt or the download was incomplete. Check the version number and network connectivity."
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
    mv "${EXTRACTED_DIR}" "${VSCODE_DIR}"
    rm -rf "${EXTRACT_TMP}"
    ln -sf "${VSCODE_DIR}/bin/code" "${VSCODE_BIN}"
    log_info "Extraction complete."

    cat <<-EOF > "${VSCODE_DESKTOP}"
	[Desktop Entry]
	Name=Visual Studio Code ${VSCODE_VERSION}
	Comment=Code Editing. Redefined.
	Exec=${VSCODE_DIR}/bin/code %F
	Icon=${VSCODE_DIR}/resources/app/resources/linux/code.png
	Type=Application
	Categories=Development;IDE;TextEditor;
	Terminal=false
	MimeType=text/plain;inode/directory;
	StartupWMClass=Code
	EOF

    update-desktop-database /usr/share/applications
    log_info "Desktop entry registered."
    log_info "Visual Studio Code ${VSCODE_VERSION} successfully installed."
fi

log_info "Launch  : code-${VSCODE_VERSION}  or open Applications menu"
log_info "Install : ${VSCODE_DIR}"
