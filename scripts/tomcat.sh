#!/bin/bash

##
## Description: Downloads and installs Apache Tomcat 10.1.33 to /opt and
##              sets ownership of the installation to the login user.
## Usage:       sudo ./tomcat.sh <login-user>
##

source /tmp/common.sh

if [[ 0 -eq $# ]]
then
    log_error 'login user not found.'
    exit 1
fi

LOGIN_USER="${1}"

####
STEP "Tomcat"
####

if [[ -d '/opt/apache-tomcat-10.1.33' ]]
then
    log_info 'Tomcat already installed.'
else
    WORK_DIR=$(mktemp -d)
    trap 'rm -rf "${WORK_DIR}"' EXIT

    wget https://dlcdn.apache.org/tomcat/tomcat-10/v10.1.33/bin/apache-tomcat-10.1.33.tar.gz -O "${WORK_DIR}/tomcat.tar.gz"
    tar -zxf "${WORK_DIR}/tomcat.tar.gz" --directory /opt

    log_info 'Tomcat successfully installed.'
fi

chown -R "${LOGIN_USER}":"${LOGIN_USER}" /opt/apache-tomcat-10.1.33
log_info "Ownership of /opt/apache-tomcat-10.1.33 set to ${LOGIN_USER}."


