#!/bin/bash

##
## Description: Downloads and installs Apache Tomcat to /opt, sets ownership
##              to the login user, and registers a per-port systemd service.
##              Each port gets its own CATALINA_BASE directory and service,
##              allowing multiple Tomcat instances to run simultaneously.
##              Once running, the Tomcat welcome page is at http://localhost:<port>
##              Optionally pass a version as the second argument (default: 10.1.33).
##              Optionally pass an HTTP port as the third argument (default: 8080).
## Usage:       sudo ./tomcat.sh <login-user> [version] [port]
## Service:     systemctl start tomcat-<port>
##              systemctl stop tomcat-<port>
##              systemctl status tomcat-<port>
##

source /tmp/common.sh

if [[ 0 -eq $# ]]
then
    log_error 'login user not found.'
    exit 1
fi

LOGIN_USER="${1}"
TOMCAT_VERSION="${2:-10.1.33}"
TOMCAT_PORT="${3:-8080}"
TOMCAT_MAJOR="${TOMCAT_VERSION%%.*}"
TOMCAT_DIR="/opt/apache-tomcat-${TOMCAT_VERSION}"
CATALINA_BASE="/opt/tomcat-instance-${TOMCAT_PORT}"
SERVICE_NAME="tomcat-${TOMCAT_PORT}"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

####
STEP "Tomcat ${TOMCAT_VERSION}"
####

if [[ -f "${TOMCAT_DIR}/bin/startup.sh" ]]
then
    log_info "Tomcat ${TOMCAT_VERSION} binaries already present."
else
    WORK_DIR=$(mktemp -d)
    trap 'rm -rf "${WORK_DIR}"' EXIT

    log_info "Downloading Tomcat ${TOMCAT_VERSION} ..."
    wget --progress=dot "https://archive.apache.org/dist/tomcat/tomcat-${TOMCAT_MAJOR}/v${TOMCAT_VERSION}/bin/apache-tomcat-${TOMCAT_VERSION}.tar.gz" -O "${WORK_DIR}/tomcat.tar.gz"
    log_info "Download complete. Extracting ..."
    tar -xf "${WORK_DIR}/tomcat.tar.gz" --directory /opt
    log_info "Tomcat ${TOMCAT_VERSION} binaries installed."
fi

chown -R "${LOGIN_USER}":"${LOGIN_USER}" "${TOMCAT_DIR}"
log_info "Ownership of ${TOMCAT_DIR} set to ${LOGIN_USER}."

####
STEP "Tomcat instance (port ${TOMCAT_PORT})"
####

if [[ -f "${SERVICE_FILE}" ]]
then
    log_info "Tomcat instance on port ${TOMCAT_PORT} already configured."
else
    mkdir -p "${CATALINA_BASE}"/{logs,temp,webapps,work}
    cp -r "${TOMCAT_DIR}/conf" "${CATALINA_BASE}/"

    if [[ "${TOMCAT_PORT}" != "8080" ]]; then
        sed -i "s/Connector port=\"8080\"/Connector port=\"${TOMCAT_PORT}\"/g" "${CATALINA_BASE}/conf/server.xml"
        log_info "HTTP port set to ${TOMCAT_PORT}."
    fi

    chown -R "${LOGIN_USER}":"${LOGIN_USER}" "${CATALINA_BASE}"
    log_info "Instance directory created at ${CATALINA_BASE}."

    JAVA_HOME_VAL="$(readlink -f /usr/bin/java | sed 's:/bin/java::')"
    if [[ -z "${JAVA_HOME_VAL}" ]]; then
        log_error 'Java not found. Install Java before Tomcat.'
        exit 1
    fi
    log_info "Using JAVA_HOME=${JAVA_HOME_VAL}"

    cat > "${SERVICE_FILE}" <<-EOT
	[Unit]
	Description=Apache Tomcat ${TOMCAT_VERSION} (port ${TOMCAT_PORT})
	After=network.target

	[Service]
	Type=forking
	User=${LOGIN_USER}
	Group=${LOGIN_USER}
	Environment="JAVA_HOME=${JAVA_HOME_VAL}"
	Environment="CATALINA_HOME=${TOMCAT_DIR}"
	Environment="CATALINA_BASE=${CATALINA_BASE}"
	ExecStart=${TOMCAT_DIR}/bin/startup.sh
	ExecStop=${TOMCAT_DIR}/bin/shutdown.sh
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
