#!/bin/bash

##
## Description: Downloads and installs Apache Maven to /opt/maven and
##              configures M2_HOME and PATH system-wide via /etc/profile.d/maven.sh.
##              Optionally pass a version as the first argument (default: latest).
##              Pass 'latest' to auto-resolve the current version from the Apache dist server.
## Usage:       sudo ./maven.sh [version]
## Parameters:  $1  [version]  Maven version to install (e.g. 3.9.9) or 'latest' (default)
##

source /tmp/common.sh

MVN_VERSION="${1:-latest}"

if [[ "${MVN_VERSION}" == 'latest' ]]; then
    log_info "Querying Apache dist server for the latest Maven 3.x release ..."
    MVN_VERSION=$(curl -fsSL "https://downloads.apache.org/maven/maven-3/" \
        | grep -oP '(?<=href=")[0-9]+\.[0-9]+\.[0-9]+(?=/)' | sort -V | tail -1)
    if [[ -z "${MVN_VERSION}" ]]; then
        log_error "Could not determine the latest Maven version. Check network connectivity."
        exit 1
    fi
    log_info "Latest version: ${MVN_VERSION}"
fi

####
STEP "Maven"
####

if [[ -x '/opt/maven/bin/mvn' ]]; then
    INSTALLED_MVN=$(/opt/maven/bin/mvn -version 2>/dev/null \
        | grep -oP '(?<=Apache Maven )[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    if [[ "${INSTALLED_MVN}" == "${MVN_VERSION}" ]]; then
        log_info "Maven ${MVN_VERSION} is already installed at /opt/maven — nothing to do."
    else
        log_warn "Maven ${INSTALLED_MVN:-unknown} is installed at /opt/maven but version ${MVN_VERSION} was requested."
        log_warn "To install a different version, remove the existing installation first:"
        log_warn "  rm -rf /opt/maven && rm -f /etc/profile.d/maven.sh"
        log_warn "Then re-run this script."
    fi
else
    WORK_DIR=$(mktemp -d)
    trap 'rm -rf "${WORK_DIR}"' EXIT

    MVN_URL="https://archive.apache.org/dist/maven/maven-3/${MVN_VERSION}/binaries/apache-maven-${MVN_VERSION}-bin.tar.gz"
    log_info "Downloading Maven ${MVN_VERSION} from ${MVN_URL} ..."
    wget -q --tries=3 "${MVN_URL}" -O "${WORK_DIR}/maven.tar.gz"
    tar -xf "${WORK_DIR}/maven.tar.gz" -C "${WORK_DIR}"
    mv "${WORK_DIR}/apache-maven-${MVN_VERSION}" /opt/maven
    log_info "Extracted to /opt/maven."

    if [[ ! -f /etc/profile.d/maven.sh ]]; then
        {
            echo 'export M2_HOME=/opt/maven'
            echo 'export PATH=${M2_HOME}/bin:${PATH}'
        } > /etc/profile.d/maven.sh
        log_info "M2_HOME and PATH configured in /etc/profile.d/maven.sh."
    else
        log_info "/etc/profile.d/maven.sh already present — PATH not modified."
    fi

    /opt/maven/bin/mvn -version
    log_info "Maven ${MVN_VERSION} successfully installed."
fi

log_info "Version : mvn -version"
log_info "Build   : mvn clean install"
log_info "Test    : mvn test"
log_info "Package : mvn package"
log_info "Install : /opt/maven"
