#!/bin/bash

##
## Description: Installs Apache HTTP Server from source to /opt/httpd-<version>.
##              Configures a versioned systemd service and sets HTTPD_HOME in ~/.bash_profile.
##              Multiple versions can coexist; /opt/httpd symlinks to the latest installed.
## Usage:       sudo ./httpd.sh <login-user> [version]
## Parameters:  $1  <login-user>  Non-root desktop username (e.g. maxmin)
##              $2  [version]     Apache version (e.g. 2.4.63); omit for latest stable
##

source /tmp/common.sh

LOGIN_USER="${1:-}"
VERSION="${2:-}"

require_login_user "${LOGIN_USER}"
HOME_DIR=$(eval echo "~${LOGIN_USER}")
cd "${HOME_DIR}"

####
STEP "Apache HTTP Server"
####

# -- Resolve version ---------------------------------------------------------
if [[ -z "${VERSION}" ]]
then
    log_info 'Fetching latest Apache HTTP Server version ...'
    VERSION=$(curl -sL 'https://downloads.apache.org/httpd/' \
        | grep -oP 'httpd-2\.\d+\.\d+\.tar\.gz' \
        | sort -V | tail -1 \
        | sed 's/httpd-//;s/\.tar\.gz//')
    if [[ -z "${VERSION}" ]]
    then
        log_error 'Could not determine latest Apache HTTP Server version.'
        exit 1
    fi
fi

log_info "Apache HTTP Server version: ${VERSION}"

INSTALL_DIR="/opt/httpd-${VERSION}"
SERVICE_NAME="httpd-${VERSION}"
TARBALL="httpd-${VERSION}.tar.gz"
CACHE_DIR="/opt/httpd-cache"
TARBALL_PATH="${CACHE_DIR}/${TARBALL}"

# -- Idempotency check -------------------------------------------------------
if [[ -d "${INSTALL_DIR}" ]]
then
    log_info "Apache HTTP Server ${VERSION} is already installed at ${INSTALL_DIR}."
    exit 0
fi

# -- Build dependencies ------------------------------------------------------
log_info 'Installing build dependencies ...'
dnf install -y gcc make openssl-devel pcre2-devel expat-devel \
    apr apr-devel apr-util apr-util-devel libxml2-devel \
    policycoreutils-python-utils

# -- Download ----------------------------------------------------------------
mkdir -p "${CACHE_DIR}"
if [[ ! -f "${TARBALL_PATH}" ]]
then
    # Try current mirror first; fall back to archive for older releases.
    DOWNLOAD_BASE='https://downloads.apache.org/httpd'
    if ! curl -fsLI "${DOWNLOAD_BASE}/${TARBALL}" >/dev/null 2>&1
    then
        DOWNLOAD_BASE='https://archive.apache.org/dist/httpd'
    fi

    log_info "Downloading Apache HTTP Server ${VERSION} ..."
    curl -fL "${DOWNLOAD_BASE}/${TARBALL}" -o "${TARBALL_PATH}"

    EXPECTED=$(curl -sL "${DOWNLOAD_BASE}/${TARBALL}.sha256" | awk '{print $1}')
    ACTUAL=$(sha256sum "${TARBALL_PATH}" | awk '{print $1}')
    if [[ "${EXPECTED}" != "${ACTUAL}" ]]
    then
        rm -f "${TARBALL_PATH}"
        log_error "Checksum mismatch for ${TARBALL}."
        exit 1
    fi
    log_info 'Checksum verified.'
else
    log_info "Using cached tarball: ${TARBALL_PATH}"
fi

# -- Build -------------------------------------------------------------------
BUILD_DIR=$(mktemp -d)
trap 'rm -rf "${BUILD_DIR}"' EXIT

cd "${BUILD_DIR}"
tar -xzf "${TARBALL_PATH}"
cd "httpd-${VERSION}"

log_info 'Configuring build ...'
./configure \
    --prefix="${INSTALL_DIR}" \
    --enable-ssl \
    --enable-so \
    --with-mpm=event \
    --enable-rewrite \
    --enable-headers \
    --enable-proxy \
    --enable-proxy-http

log_info 'Building ...'
make -j"$(nproc)"

log_info 'Installing ...'
make install

# -- Logs in /var/log --------------------------------------------------------
LOG_DIR="/var/log/httpd-${VERSION}"
mkdir -p "${LOG_DIR}"
rm -rf "${INSTALL_DIR}/logs"
ln -s "${LOG_DIR}" "${INSTALL_DIR}/logs"
log_info "Logs: ${LOG_DIR}"

# -- Symlink -----------------------------------------------------------------
ln -sfn "${INSTALL_DIR}" /opt/httpd
log_info "Symlink: /opt/httpd -> ${INSTALL_DIR}"

# -- Configure ---------------------------------------------------------------
# Set ServerName to prevent fatal FQDN warning on startup
sed -i 's/^#ServerName.*/ServerName localhost/' "${INSTALL_DIR}/conf/httpd.conf"

# -- SELinux -----------------------------------------------------------------
# Binaries in /opt/ have no SELinux type by default; label them so systemd
# can execute them and httpd can bind to port 80/443.
if command -v semanage &>/dev/null
then
    semanage fcontext -a -t httpd_exec_t        "${INSTALL_DIR}/bin/httpd"          2>/dev/null || true
    semanage fcontext -a -t httpd_exec_t        "${INSTALL_DIR}/bin/apachectl"      2>/dev/null || true
    semanage fcontext -a -t httpd_config_t      "${INSTALL_DIR}/conf(/.*)?"         2>/dev/null || true
    semanage fcontext -a -t httpd_log_t         "/var/log/httpd-${VERSION}(/.*)?"   2>/dev/null || true
    semanage fcontext -a -t httpd_sys_content_t "${INSTALL_DIR}/htdocs(/.*)?"       2>/dev/null || true
    restorecon -Rv "${INSTALL_DIR}"
    restorecon -Rv "${LOG_DIR}"
    semanage port -a -t http_port_t -p tcp 80  2>/dev/null || true
    semanage port -a -t http_port_t -p tcp 443 2>/dev/null || true
fi

# -- PATH in ~/.bash_profile -------------------------------------------------
PROFILE="${HOME_DIR}/.bash_profile"
if ! grep -q 'HTTPD_HOME' "${PROFILE}" 2>/dev/null
then
    {
        echo ''
        echo '# Apache HTTP Server'
        echo 'export HTTPD_HOME=/opt/httpd'
        echo 'export PATH="${HTTPD_HOME}/bin:${PATH}"'
    } >> "${PROFILE}"
    log_info 'HTTPD_HOME added to ~/.bash_profile.'
fi

# -- Systemd service ---------------------------------------------------------
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

cat > "${SERVICE_FILE}" <<UNIT
[Unit]
Description=Apache HTTP Server ${VERSION}
After=network.target

[Service]
Type=forking
PIDFile=${INSTALL_DIR}/logs/httpd.pid
ExecStart=${INSTALL_DIR}/bin/apachectl -k start
ExecReload=${INSTALL_DIR}/bin/apachectl -k graceful
ExecStop=${INSTALL_DIR}/bin/apachectl -k graceful-stop
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT

log_info 'Testing configuration ...'
"${INSTALL_DIR}/bin/httpd" -t

systemctl daemon-reload

log_info "Apache HTTP Server ${VERSION} successfully installed."
log_info "Install dir  : ${INSTALL_DIR}"
log_info "Symlink      : /opt/httpd -> ${INSTALL_DIR}"
log_info "Config       : ${INSTALL_DIR}/conf/httpd.conf"
log_info "Document root: ${INSTALL_DIR}/htdocs"
log_info "Logs         : /var/log/httpd-${VERSION}/access_log | error_log"
log_info "--- To start  : systemctl start ${SERVICE_NAME}"
log_info "--- To stop   : systemctl stop ${SERVICE_NAME}"
log_info "--- To enable at boot: systemctl enable ${SERVICE_NAME}"
log_info "--- To test   : curl http://localhost"
log_info "--- To check which version is actually serving traffic:"
log_info "---   sudo ss -ltnp 'sport = :80'"
log_info "---   sudo readlink -f /proc/<PID>/exe"

# A different version's service may already be bound to the same port(s).
# Point that out explicitly rather than letting the new service silently
# fail to start later with a confusing "Address already in use".
OTHER_RUNNING=$(systemctl list-units --type=service --state=running --no-legend --plain 'httpd-*.service' 2>/dev/null \
    | awk '{print $1}' | grep -v "^${SERVICE_NAME}\.service$" || true)
if [[ -n "${OTHER_RUNNING}" ]]; then
    log_warn "Another Apache version is currently running and using the same port(s):"
    for _svc in ${OTHER_RUNNING}; do
        log_warn "  ${_svc}"
    done
    log_warn "To switch to the version you just installed:"
    for _svc in ${OTHER_RUNNING}; do
        log_warn "  systemctl stop ${_svc}"
    done
    log_warn "  systemctl start ${SERVICE_NAME}"
fi
