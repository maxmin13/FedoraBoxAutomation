#!/bin/bash

##
## Description: Downloads and installs Apache Maven to /opt/maven and
##              configures M2_HOME and PATH system-wide via /etc/profile.d/maven.sh.
##              Optionally pass a version as the first argument (default: 3.9.5).
## Usage:       sudo ./maven.sh [version]
## Parameters:  $1  [version]  Maven version to install (default: 3.9.5)
##

source /tmp/common.sh

MVN_VERSION="${1:-3.9.5}"

####
STEP "Maven"
####

if [[ -x '/opt/maven/bin/mvn' ]]
then
    log_info "Maven already installed."
else
    WORK_DIR=$(mktemp -d)
    trap 'rm -rf "${WORK_DIR}"' EXIT

    wget -q "https://archive.apache.org/dist/maven/maven-3/${MVN_VERSION}/binaries/apache-maven-${MVN_VERSION}-bin.tar.gz" -O "${WORK_DIR}/maven.tar.gz"
    tar -xf "${WORK_DIR}/maven.tar.gz" -C "${WORK_DIR}"
    mv "${WORK_DIR}/apache-maven-${MVN_VERSION}" /opt/maven

    if [[ ! -f /etc/profile.d/maven.sh ]]
    then
        {
            echo 'export M2_HOME=/opt/maven'
            echo 'export PATH=${M2_HOME}/bin:${PATH}'
        } > /etc/profile.d/maven.sh
    fi

    /opt/maven/bin/mvn -version
    log_info "Maven ${MVN_VERSION} successfully installed."
fi

log_info "Version : mvn -version"
log_info "Build   : mvn clean install"
log_info "Test    : mvn test"
log_info "Package : mvn package"
log_info "Install : /opt/maven"
