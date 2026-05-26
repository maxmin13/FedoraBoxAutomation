#!/bin/bash

##
## Description: Downloads and installs Apache Tomcat to /opt/apache-tomcat-<version>-<port>,
##              sets ownership to the login user, and registers a per-port systemd service.
##              Each port gets its own self-contained installation directory,
##              allowing multiple Tomcat instances to run simultaneously.
##              Once running, the Tomcat welcome page is at http://localhost:<port>
##              Optionally pass a version as the second argument (default: 10.1.33).
##              Optionally pass an HTTP port as the third argument (default: 8080).
## Usage:       sudo ./tomcat.sh <login-user> [version] [port]
## Parameters:  $1  <login-user>  Non-root desktop username (e.g. maxmin)
##              $2  [version]     Tomcat version to install (default: 10.1.33)
##              $3  [port]        HTTP port for this Tomcat instance (default: 8080)
## Pre-checks:  - JAVA_HOME must be set or Java must be on PATH (run java.sh first)
##              - $JAVA_HOME/bin/java must exist and be executable
##              - Installation directory /opt/apache-tomcat-<version>-<port> must not exist
##              - HTTP port must not already be in use by another process
##              Note: Tomcat shutdown port (8005) is disabled; multiple instances on
##              different HTTP ports can run simultaneously without conflict.
## Service:     systemctl start tomcat-<version>-<port>
##              systemctl stop tomcat-<version>-<port>
##              systemctl status tomcat-<version>-<port>
##

source /tmp/common.sh

LOGIN_USER="${1:-}"
require_login_user "${LOGIN_USER}"
TOMCAT_VERSION="${2:-10.1.33}"
TOMCAT_PORT="${3:-8080}"
TOMCAT_MAJOR="${TOMCAT_VERSION%%.*}"
TOMCAT_DIR="/opt/apache-tomcat-${TOMCAT_VERSION}-${TOMCAT_PORT}"
SERVICE_NAME="tomcat-${TOMCAT_VERSION}-${TOMCAT_PORT}"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

####
STEP "Java check"
####

if [[ -z "${JAVA_HOME:-}" ]]; then
    JAVA_BIN="$(readlink -f /usr/bin/java 2>/dev/null)"
    if [[ -n "${JAVA_BIN}" ]]; then
        export JAVA_HOME="${JAVA_BIN%/bin/java}"
        log_warn "JAVA_HOME was not set; resolved to ${JAVA_HOME} from /usr/bin/java."
    else
        log_error 'JAVA_HOME is not set and Java was not found. Run java.sh before tomcat.sh.'
        exit 2
    fi
fi

if [[ ! -x "${JAVA_HOME}/bin/java" ]]; then
    log_error "JAVA_HOME=${JAVA_HOME} does not contain a valid Java executable. Run java.sh before tomcat.sh."
    exit 2
fi

log_info "JAVA_HOME=${JAVA_HOME}"

####
STEP "Port check"
####

if [[ -d "${TOMCAT_DIR}" ]]; then
    log_error "Installation directory ${TOMCAT_DIR} already exists. Run tomcat-remove.sh first."
    exit 1
fi

if ss -tlnp | grep -q ":${TOMCAT_PORT} "; then
    log_error "Port ${TOMCAT_PORT} is already in use. Choose a different port or stop the existing process."
    ss -tlnp | grep ":${TOMCAT_PORT} "
    exit 1
fi

log_info "Port ${TOMCAT_PORT} is available."

####
STEP "Tomcat ${TOMCAT_VERSION}"
####

CACHE_DIR="/opt/tomcat-cache"
CACHED_TAR="${CACHE_DIR}/apache-tomcat-${TOMCAT_VERSION}.tar.gz"

mkdir -p "${CACHE_DIR}"

if [[ ! -f "${CACHED_TAR}" ]]; then
    log_info "Downloading Tomcat ${TOMCAT_VERSION} ..."
    wget "https://archive.apache.org/dist/tomcat/tomcat-${TOMCAT_MAJOR}/v${TOMCAT_VERSION}/bin/apache-tomcat-${TOMCAT_VERSION}.tar.gz" -O "${CACHED_TAR}"
    log_info "Download complete. Cached at ${CACHED_TAR}."
else
    log_info "Using cached archive: ${CACHED_TAR}"
fi

log_info "Extracting ..."
tar -xf "${CACHED_TAR}" --directory /opt
mv "/opt/apache-tomcat-${TOMCAT_VERSION}" "${TOMCAT_DIR}"
log_info "Tomcat ${TOMCAT_VERSION} installed at ${TOMCAT_DIR}."

chown -R "${LOGIN_USER}":"${LOGIN_USER}" "${TOMCAT_DIR}"
log_info "Ownership of ${TOMCAT_DIR} set to ${LOGIN_USER}."

####
STEP "Tomcat instance (port ${TOMCAT_PORT})"
####

if [[ -f "${SERVICE_FILE}" ]]
then
    log_info "Tomcat instance on port ${TOMCAT_PORT} already configured."
else
    mkdir -p "${TOMCAT_DIR}"/{logs,temp,work}

    # Disable shutdown port so multiple instances don't conflict
    sed -i 's/<Server port="[0-9]*" shutdown="SHUTDOWN">/<Server port="-1" shutdown="SHUTDOWN">/' "${TOMCAT_DIR}/conf/server.xml"
    log_info "Shutdown port disabled."

    sed -i "s/Connector port=\"8080\"/Connector port=\"${TOMCAT_PORT}\"/g" "${TOMCAT_DIR}/conf/server.xml"
    log_info "HTTP port set to ${TOMCAT_PORT}."

    cat > "${SERVICE_FILE}" <<-EOT
	[Unit]
	Description=Apache Tomcat ${TOMCAT_VERSION} (port ${TOMCAT_PORT})
	After=network.target

	[Service]
	Type=forking
	User=${LOGIN_USER}
	Group=${LOGIN_USER}
	Environment="JAVA_HOME=${JAVA_HOME}"
	Environment="CATALINA_HOME=${TOMCAT_DIR}"
	Environment="CATALINA_BASE=${TOMCAT_DIR}"
	Environment="CATALINA_PID=${TOMCAT_DIR}/tomcat.pid"
	PIDFile=${TOMCAT_DIR}/tomcat.pid
	ExecStart=${TOMCAT_DIR}/bin/startup.sh
	ExecStop=/bin/kill -s TERM \$MAINPID
	TimeoutStopSec=10
	Restart=on-failure

	[Install]
	WantedBy=multi-user.target
	EOT

    systemctl daemon-reload
    systemctl enable "${SERVICE_NAME}"
    log_info "Service ${SERVICE_NAME} registered and enabled."
fi

systemctl start "${SERVICE_NAME}"
systemctl status "${SERVICE_NAME}" --no-pager
log_info "Tomcat ${TOMCAT_VERSION} started on port ${TOMCAT_PORT}."
log_info "Welcome page : http://localhost:${TOMCAT_PORT}"
log_info "Start        : systemctl start ${SERVICE_NAME}"
log_info "Stop         : systemctl stop ${SERVICE_NAME}"
log_info "Restart      : systemctl restart ${SERVICE_NAME}"
log_info "Status       : systemctl status ${SERVICE_NAME}"
log_info "Logs         : journalctl -u ${SERVICE_NAME} -f"
