#!/bin/bash

##
## Description: Downloads and installs Eclipse IDE for Java Developers to /opt/eclipse-<release>
##              and registers a per-version GNOME desktop entry. Multiple versions coexist.
##              Pass 'latest' to auto-resolve the current release from the Eclipse EPP downloads page.
## Usage:       sudo ./eclipse.sh <release>
## Parameters:  $1  <release>  Eclipse release to install (e.g. 2026-03) or 'latest'
##

source /tmp/common.sh

if ! command -v java &>/dev/null; then
    log_error "Java is not installed or not on PATH. Run java.sh before running this script."
    exit 2
fi

if [[ -z "${1:-}" ]]; then
    log_error "Eclipse release argument is required (e.g. 2026-03 or 'latest')"
    exit 1
fi
ECLIPSE_RELEASE="$1"

if [[ "${ECLIPSE_RELEASE}" == 'latest' ]]; then
    log_info "Querying Eclipse EPP downloads for the latest release ..."
    ECLIPSE_RELEASE=$(curl -fsSL "https://download.eclipse.org/technology/epp/downloads/release/" \
        | grep -Eo 'release/[0-9]{4}-[0-9]{2}' \
        | grep -Eo '[0-9]{4}-[0-9]{2}' \
        | sort -r | head -1) || true
    if [[ -z "${ECLIPSE_RELEASE}" ]]; then
        log_error "Could not determine the latest Eclipse release. Check network connectivity or pass the release explicitly (e.g. 2026-03)."
        exit 1
    fi
    log_info "Latest release: ${ECLIPSE_RELEASE}"
fi
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
        wget -q --tries=3 "${ECLIPSE_URL}" -O "${CACHED_TAR}"
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
log_info ""
log_info "--- Post-install setup ---"
log_info "1. First launch: choose a workspace directory when prompted."
log_info "2. Set JAVA_HOME in ~/.bashrc if not already set:"
log_info "     export JAVA_HOME=\$(dirname \$(dirname \$(readlink -f \$(which java))))"
log_info "     export PATH=\$JAVA_HOME/bin:\$PATH"
log_info "3. Configure JDK in Eclipse: Window > Preferences > Java > Installed JREs > Add."
log_info "   Point it to \$JAVA_HOME (java.sh installs under /usr/lib/jvm/)."
log_info ""
log_info "--- Claude Code (AI assistant) ---"
log_info "Eclipse has no native Claude Code plugin. Use the CLI alongside Eclipse:"
log_info "  Install : npm install -g @anthropic-ai/claude-code   (requires Node.js)"
log_info "  Auth    : set ANTHROPIC_API_KEY in ~/.bashrc, or run 'claude' and sign in via browser"
log_info "  Use     : open a terminal, cd to your project, run 'claude'"
