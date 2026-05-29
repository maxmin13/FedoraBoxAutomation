#!/bin/bash

##
## Description: Installs the AWS CLI v2 from the official Amazon ZIP bundle
##              and creates ~/.aws directory for the login user.
##              After installation, run 'aws configure' to set credentials.
## Usage:       sudo ./aws-cli.sh <login-user>
## Parameters:  $1  <login-user>  Non-root desktop username (e.g. maxmin)
##

source /tmp/common.sh

LOGIN_USER="${1:-}"
FORCE="${2:-}"
require_login_user "${LOGIN_USER}"
HOME_DIR=$(eval echo "~${LOGIN_USER}")

####
STEP "AWS client"
####

WORK_DIR=$(mktemp -d)
trap 'rm -rf "${WORK_DIR}"' EXIT

# Detect existing installation by directory, not by command — guestcontrol
# does not put /usr/local/bin in PATH, so 'aws --version' returns false even
# when AWS CLI is installed, causing a plain install to fail with:
# "Found preexisting AWS CLI installation ... rerun with --update flag."
INSTALL_DIR="${FEDORA_BOX_AWS_INSTALL_DIR:-/usr/local/aws-cli}"
AWS_BIN="${FEDORA_BOX_AWS_BIN:-/usr/local/bin/aws}"
if [ -d "${INSTALL_DIR}" ] && [ "${FORCE}" != '--force' ]; then
    log_info "AWS CLI is already installed at ${INSTALL_DIR}. Use 'Install anyway' to update it."
    exit 1
fi

INSTALL_FLAG=''
if [ -d "${INSTALL_DIR}" ]; then
    INSTALL_FLAG='--update'
    log_info "Updating existing installation at ${INSTALL_DIR} ..."
else
    log_info 'No existing installation found — performing fresh install.'
fi

log_info 'Installing dependency: unzip ...'
dnf install -y unzip

log_info 'Downloading AWS CLI v2 bundle ...'
curl -# "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "${WORK_DIR}/awscliv2.zip"

log_info 'Unpacking bundle ...'
unzip -q "${WORK_DIR}/awscliv2.zip" -d "${WORK_DIR}"

log_info "Running installer${INSTALL_FLAG:+ (${INSTALL_FLAG})} ..."
# shellcheck disable=SC2086
"${WORK_DIR}/aws/install" ${INSTALL_FLAG}

if [ -n "${INSTALL_FLAG}" ]; then
    log_info 'AWS CLI v2 updated successfully.'
else
    log_info 'AWS CLI v2 installed successfully.'
fi

log_info "Installed version: $("$AWS_BIN" --version 2>&1)"

mkdir -p "${HOME_DIR}/.aws"
chown -R "${LOGIN_USER}":"${LOGIN_USER}" "${HOME_DIR}/.aws"
log_info "~/.aws directory created for ${LOGIN_USER}."

log_info "---"
log_info "Next steps:"
log_info "  1. Run 'aws configure' to enter your Access Key ID, Secret Access Key, region, and output format."
log_info "     Credentials are stored in ~/.aws/credentials"
log_info "  2. Verify the connection:  aws sts get-caller-identity"
log_info "  3. List S3 buckets:        aws s3 ls"
log_info "  4. List EC2 instances:     aws ec2 describe-instances --query 'Reservations[*].Instances[*].InstanceId'"
log_info "---"