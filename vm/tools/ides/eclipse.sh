#!/bin/bash

##
## Description: Downloads and installs Eclipse IDE for Java Developers to /opt/eclipse-<release>
##              and registers a per-version GNOME desktop entry. Multiple versions coexist.
##              Optionally pass a release as the first argument (default: 2026-03).
## Usage:       sudo ./eclipse.sh [release]
## Parameters:  $1  <release>  Eclipse release to install (e.g. 2026-03)
##

source /tmp/common.sh

if [[ -z "${1:-}" ]]; then
    log_error "Eclipse release argument is required (e.g. 2026-03)"
    exit 1
fi
ECLIPSE_RELEASE="$1"
ECLIPSE_DIR="/opt/eclipse-${ECLIPSE_RELEASE}"
ECLIPSE_BIN="/usr/bin/eclipse-${ECLIPSE_RELEASE}"
ECLIPSE_DESKTOP="/usr/share/applications/eclipse-${ECLIPSE_RELEASE}.desktop"

####
STEP "Eclipse"
####

if [[ -d "${ECLIPSE_DIR}" && ! -x "${ECLIPSE_DIR}/eclipse" ]]
then
    log_warn "Incomplete Eclipse installation found. Removing ${ECLIPSE_DIR} ..."
    rm -rf "${ECLIPSE_DIR}"
    rm -f "${ECLIPSE_BIN}" "${ECLIPSE_DESKTOP}"
fi

if [[ -x "${ECLIPSE_DIR}/eclipse" ]]
then
    log_info "Eclipse ${ECLIPSE_RELEASE} already installed."
else
    CACHE_DIR="/opt/eclipse-cache"
    CACHED_TAR="${CACHE_DIR}/eclipse-jee-${ECLIPSE_RELEASE}-R-linux-gtk-x86_64.tar.gz"
    mkdir -p "${CACHE_DIR}"

    ECLIPSE_URL="https://download.eclipse.org/technology/epp/downloads/release/${ECLIPSE_RELEASE}/R/eclipse-jee-${ECLIPSE_RELEASE}-R-linux-gtk-x86_64.tar.gz"

    if [[ ! -f "${CACHED_TAR}" ]]; then
        log_info "Downloading Eclipse ${ECLIPSE_RELEASE} from ${ECLIPSE_URL} ..."
        wget -q "${ECLIPSE_URL}" -O "${CACHED_TAR}"
        gzip -t "${CACHED_TAR}" 2>/dev/null || {
            rm -f "${CACHED_TAR}"
            log_error "Eclipse ${ECLIPSE_RELEASE} archive is corrupt or the download was incomplete. Check the release name and network connectivity."
            exit 1
        }
        log_info "Download complete. Cached at ${CACHED_TAR}."
    else
        log_info "Using cached archive: ${CACHED_TAR}"
    fi
    log_info "Extracting ..."
    # Remove any stale /opt/eclipse left by a previous failed run before extracting.
    [[ -d /opt/eclipse ]] && rm -rf /opt/eclipse
    tar -xf "${CACHED_TAR}" --directory /opt
    if [[ ! -d /opt/eclipse ]]; then
        log_error "Extraction produced no 'eclipse' directory under /opt — the archive may be corrupt or use an unexpected layout."
        exit 1
    fi
    mv /opt/eclipse "${ECLIPSE_DIR}"
    ln -sf "${ECLIPSE_DIR}/eclipse" "${ECLIPSE_BIN}"
    log_info "Extraction complete."

    # Force GTK2 to prevent the JVM hanging on VirtualBox's virtual display.
    # Must appear before -vmargs in eclipse.ini.
    sed -i 's/^-vmargs/--launcher.GTK_version\n2\n-vmargs/' "${ECLIPSE_DIR}/eclipse.ini"
    log_info "eclipse.ini patched for VirtualBox compatibility (GTK2)."

    cat <<-EOF > "${ECLIPSE_DESKTOP}"
	[Desktop Entry]
	Encoding=UTF-8
	Name=Eclipse IDE ${ECLIPSE_RELEASE}
	Comment=Eclipse IDE for Java Developers ${ECLIPSE_RELEASE}
	Exec=${ECLIPSE_BIN}
	Icon=${ECLIPSE_DIR}/icon.xpm
	Categories=Application;Development;Java;IDE
	Type=Application
	Terminal=0
	EOF

    update-desktop-database /usr/share/applications
    log_info 'Eclipse desktop entry registered.'
    log_info "Eclipse ${ECLIPSE_RELEASE} successfully installed."
fi

log_info "Launch  : eclipse-${ECLIPSE_RELEASE} &   or open Applications menu"
log_info "Install : ${ECLIPSE_DIR}"
