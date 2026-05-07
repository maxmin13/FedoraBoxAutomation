#!/bin/bash

##
## Description: Installs the AWS CLI v2 from the official Amazon ZIP bundle
##              and creates ~/.aws directory for the login user.
##              After installation, run 'aws configure' to set credentials.
## Usage:       sudo ./aws-cli.sh <login-user>
## Parameters:  $1  <login-user>  Non-root desktop username (e.g. maxmin)
##

source /tmp/common.sh

if [[ 0 -eq $# ]]
then
    log_error 'login user not found.'
    exit 1
fi

LOGIN_USER="${1}"
HOME_DIR=$(eval echo "~${LOGIN_USER}")

####
STEP "AWS client"
####

WORK_DIR=$(mktemp -d)
trap 'rm -rf "${WORK_DIR}"' EXIT

if ! aws --version > /dev/null 2>&1
then
    dnf install -y unzip
    curl -# "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "${WORK_DIR}/awscliv2.zip"
    unzip "${WORK_DIR}/awscliv2.zip" -d "${WORK_DIR}"
    "${WORK_DIR}/aws/install"
    log_info 'AWS CLI v2 installed.'
else
    log_info 'AWS CLI already installed.'
fi

aws --version

mkdir -p "${HOME_DIR}/.aws"
chown -R "${LOGIN_USER}":"${LOGIN_USER}" "${HOME_DIR}/.aws"
log_info "~/.aws directory created for ${LOGIN_USER}. Run 'aws configure' to set credentials."