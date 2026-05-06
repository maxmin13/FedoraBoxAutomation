#!/bin/bash

##
## Description: Downloads and installs Apache Tomcat to /opt, sets ownership
##              to the login user, and registers a systemd service so Tomcat
##              starts on boot and can be managed via systemctl.
##              Once running, the Tomcat welcome page is at http://localhost:8080
##              Optionally pass a version as the second argument (default: 10.1.33).
## Usage:       sudo ./tomcat.sh <login-user> [version]
## Service:     systemctl start tomcat
##              systemctl stop tomcat
##              systemctl status tomcat
##

source /tmp/common.sh

if [[ 0 -eq $# ]]
then
    log_error 'login user not found.'
    exit 1
fi

LOGIN_USER="${1}"
TOMCAT_VERSION="${2:-10.1.33}"
TOMCAT_MAJOR="${TOMCAT_VERSION%%.*}"
TOMCAT_DIR="/opt/apache-tomcat-${TOMCAT_VERSION}"

####
STEP "Tomcat"
####

if [[ -f "${TOMCAT_DIR}/bin/startup.sh" ]]
then
    log_info "Tomcat ${TOMCAT_VERSION} already installed."
else
    WORK_DIR=$(mktemp -d)
    trap 'rm -rf "${WORK_DIR}"' EXIT

    log_info "Downloading Tomcat ${TOMCAT_VERSION} ..."
    wget --progress=dot "https://archive.apache.org/dist/tomcat/tomcat-${TOMCAT_MAJOR}/v${TOMCAT_VERSION}/bin/apache-tomcat-${TOMCAT_VERSION}.tar.gz" -O "${WORK_DIR}/tomcat.tar.gz"
    log_info "Download complete. Extracting ..."
    tar -xf "${WORK_DIR}/tomcat.tar.gz" --directory /opt
    log_info "Tomcat ${TOMCAT_VERSION} successfully installed."
fi

chown -R "${LOGIN_USER}":"${LOGIN_USER}" "${TOMCAT_DIR}"
log_info "Ownership of ${TOMCAT_DIR} set to ${LOGIN_USER}."

####
STEP "Tomcat service"
####

SERVICE_FILE="/etc/systemd/system/tomcat.service"

if [[ -f "${SERVICE_FILE}" ]]
then
    log_info "Tomcat service already registered."
else
    JAVA_HOME_VAL="$(readlink -f /usr/bin/java | sed 's:/bin/java::')"
    if [[ -z "${JAVA_HOME_VAL}" ]]; then
        log_error 'Java not found. Install Java before Tomcat.'
        exit 1
    fi
    log_info "Using JAVA_HOME=${JAVA_HOME_VAL}"

    cat > "${SERVICE_FILE}" <<-EOT
	[Unit]
	Description=Apache Tomcat ${TOMCAT_VERSION}
	After=network.target

	[Service]
	Type=forking
	User=${LOGIN_USER}
	Group=${LOGIN_USER}
	Environment="JAVA_HOME=${JAVA_HOME_VAL}"
	Environment="CATALINA_HOME=${TOMCAT_DIR}"
	ExecStart=${TOMCAT_DIR}/bin/startup.sh
	ExecStop=${TOMCAT_DIR}/bin/shutdown.sh
	Restart=on-failure

	[Install]
	WantedBy=multi-user.target
	EOT

    systemctl daemon-reload
    systemctl enable tomcat
    log_info "Tomcat service registered and enabled."
fi

systemctl start tomcat
systemctl status tomcat --no-pager
log_info "Tomcat ${TOMCAT_VERSION} started."
