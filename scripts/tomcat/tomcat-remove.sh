#!/bin/bash

##
## Description: Removes an Apache Tomcat instance installed by tomcat.sh.
##              Stops and disables the per-port systemd service, removes the
##              CATALINA_BASE directory, and optionally removes the shared
##              Tomcat binaries from /opt.
## Usage:       sudo ./tomcat-remove.sh [version] [port]
## Parameters:  $1  [version]  Tomcat version to remove (default: 10.1.33)
##              $2  [port]     HTTP port of the instance to remove (default: 8080)
##

source /tmp/common.sh

TOMCAT_VERSION="${1:-10.1.33}"
TOMCAT_PORT="${2:-8080}"
TOMCAT_DIR="/opt/apache-tomcat-${TOMCAT_VERSION}-${TOMCAT_PORT}"
SERVICE_NAME="tomcat-${TOMCAT_VERSION}-${TOMCAT_PORT}"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

####
STEP "Stop and remove service ${SERVICE_NAME}"
####

if systemctl is-active --quiet "${SERVICE_NAME}"; then
    systemctl kill --signal=SIGKILL "${SERVICE_NAME}" 2>/dev/null || true
    systemctl stop "${SERVICE_NAME}" --no-block 2>/dev/null || true
    log_info "Service ${SERVICE_NAME} stopped."
else
    log_info "Service ${SERVICE_NAME} was not running."
fi

if systemctl is-enabled --quiet "${SERVICE_NAME}" 2>/dev/null; then
    systemctl disable "${SERVICE_NAME}"
    log_info "Service ${SERVICE_NAME} disabled."
fi

if [[ -f "${SERVICE_FILE}" ]]; then
    rm -f "${SERVICE_FILE}"
    systemctl daemon-reload
    log_info "Service file ${SERVICE_FILE} removed."
else
    log_info "Service file not found, skipping."
fi

####
STEP "Remove Tomcat installation"
####

if [[ -d "${TOMCAT_DIR}" ]]; then
    rm -rf "${TOMCAT_DIR}"
    log_info "Removed ${TOMCAT_DIR}."
else
    log_info "${TOMCAT_DIR} not found, skipping."
fi

log_info "Tomcat ${TOMCAT_VERSION} instance on port ${TOMCAT_PORT} removed."
