#!/bin/bash

##
## Description: Downloads and installs Apache Maven 3.9.5 to /opt/maven and
##              configures M2_HOME and PATH via /etc/profile.d/maven.sh.
## Usage:       sudo ./maven.sh <login-user>
##

source /tmp/common.sh

if [[ 0 -eq $# ]] 
then
   echo 'ERROR: login user not found.'
   exit 1
fi

LOGIN_USER="${1}"
MVN_VERSION="3.9.5"

WORK_DIR=$(mktemp -d)
trap 'rm -rf "${WORK_DIR}"' EXIT

####
STEP "Maven"
####

if [[ -d /opt/maven ]]
then
    log_info "Maven already installed: $(source /etc/profile.d/maven.sh 2>/dev/null; mvn -version 2>&1 | head -1)"
else
    wget "https://dlcdn.apache.org/maven/maven-3/${MVN_VERSION}/binaries/apache-maven-${MVN_VERSION}-bin.tar.gz" -O "${WORK_DIR}/apache-maven-${MVN_VERSION}-bin.tar.gz"

    tar -xvzf "${WORK_DIR}/apache-maven-${MVN_VERSION}-bin.tar.gz" -C "${WORK_DIR}"
    mv "${WORK_DIR}/apache-maven-${MVN_VERSION}" /opt/maven

    if [[ ! -f /etc/profile.d/maven.sh ]]
    then
    {
        echo 'export M2_HOME=/opt/maven'
        echo 'export PATH=${M2_HOME}/bin:${PATH}'
    } > /etc/profile.d/maven.sh
    fi

    source /etc/profile.d/maven.sh
    mvn -version
    log_info "Maven ${MVN_VERSION} successfully installed."
fi
