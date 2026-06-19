#!/bin/bash

##
## Description: Downloads and installs Apache Maven to /opt/maven-<version> and
##              configures M2_HOME and PATH system-wide via /etc/profile.d/maven.sh.
##              Multiple versions can coexist; each gets its own directory.
##              Optionally pass a version as the first argument (default: latest).
##              Pass 'latest' to auto-resolve the current version from the Apache dist server.
## Usage:       sudo ./maven.sh [version]
## Parameters:  $1  [version]  Maven version to install (e.g. 3.9.9) or 'latest' (default)
##

source /tmp/common.sh

MVN_VERSION="${1:-latest}"

if [[ "${MVN_VERSION}" == 'latest' ]]; then
    log_info "Querying Apache dist server for the latest Maven 3.x release ..."
    MVN_VERSION=$(curl -fsSL --max-time 30 "https://downloads.apache.org/maven/maven-3/" \
        | grep -oP '(?<=href=")[0-9]+\.[0-9]+\.[0-9]+(?=/)' | sort -V | tail -1)
    if [[ -z "${MVN_VERSION}" ]]; then
        log_error "Could not determine the latest Maven version. Check network connectivity."
        exit 1
    fi
    log_info "Latest version: ${MVN_VERSION}"
fi

INSTALL_DIR="/opt/maven-${MVN_VERSION}"
CACHE_DIR="/var/cache/maven"
CACHED_TGZ="${CACHE_DIR}/apache-maven-${MVN_VERSION}-bin.tar.gz"

####
STEP "Maven"
####

if [[ -x "${INSTALL_DIR}/bin/mvn" ]]; then
    if [[ "$(readlink /usr/local/bin/mvn 2>/dev/null)" == "${INSTALL_DIR}/bin/mvn" ]]; then
        log_info "Maven ${MVN_VERSION} is already installed at ${INSTALL_DIR} — nothing to do."
    else
        ln -sfn "${INSTALL_DIR}/bin/mvn" /usr/local/bin/mvn
        log_info "Symlink updated: /usr/local/bin/mvn -> ${INSTALL_DIR}/bin/mvn"
    fi
else
    WORK_DIR=$(mktemp -d)
    trap 'rm -rf "${WORK_DIR}"' EXIT

    mkdir -p "${CACHE_DIR}"
    if [[ -f "${CACHED_TGZ}" ]]; then
        log_info "Using cached tarball: ${CACHED_TGZ}"
    else
        MVN_URL="https://archive.apache.org/dist/maven/maven-3/${MVN_VERSION}/binaries/apache-maven-${MVN_VERSION}-bin.tar.gz"
        log_info "Downloading Maven ${MVN_VERSION} from ${MVN_URL} ..."
        wget -q --tries=3 --timeout=60 "${MVN_URL}" -O "${CACHED_TGZ}"
    fi
    tar -xf "${CACHED_TGZ}" -C "${WORK_DIR}"
    mv "${WORK_DIR}/apache-maven-${MVN_VERSION}" "${INSTALL_DIR}"
    log_info "Extracted to ${INSTALL_DIR}."

    ln -sfn "${INSTALL_DIR}/bin/mvn" /usr/local/bin/mvn
    log_info "Symlink: /usr/local/bin/mvn -> ${INSTALL_DIR}/bin/mvn"

    "${INSTALL_DIR}/bin/mvn" -version
    log_info "Maven ${MVN_VERSION} successfully installed."
fi

{
    echo "export M2_HOME=${INSTALL_DIR}"
    echo 'export PATH=${M2_HOME}/bin:${PATH}'
} > /etc/profile.d/maven.sh
log_info "M2_HOME configured in /etc/profile.d/maven.sh -> ${INSTALL_DIR}."

log_info "Version : mvn -version"
log_info "Build   : mvn clean install"
log_info "Test    : mvn test"
log_info "Package : mvn package"
log_info "Install : ${INSTALL_DIR}"
