#!/bin/bash

##
## Description: Builds and installs OpenSSL 3.3.2 from source to /usr/local/ssl
##              and adds it to the login user's PATH in ~/.bash_profile.
## Usage:       sudo ./openssl.sh <login-user>
##

source /tmp/common.sh

if [[ 0 -eq $# ]]
then
    log_error 'login user not found.'
    exit 1
fi

LOGIN_USER="${1}"
HOME_DIR=$(eval echo "~${LOGIN_USER}")
OPENSSL_VERSION="3.3.2"
OPENSSL_DIR="/usr/local/ssl"

####
STEP "OpenSSL"
####

dnf update -y
dnf groupinstall "Development Tools" -y
dnf install -y perl-core zlib-devel

set +e
installed_version="$(openssl version 2>/dev/null)"
set -e

if [[ "${installed_version}" =~ .*"${OPENSSL_VERSION}".* ]]
then
    log_info "OpenSSL ${OPENSSL_VERSION} already installed."
else
    WORK_DIR=$(mktemp -d)
    trap 'rm -rf "${WORK_DIR}"' EXIT

    log_info "Installing OpenSSL ${OPENSSL_VERSION} ..."

    mkdir -p "${OPENSSL_DIR}"

    wget "https://www.openssl.org/source/openssl-${OPENSSL_VERSION}.tar.gz" -O "${WORK_DIR}/openssl.tar.gz"
    tar -xf "${WORK_DIR}/openssl.tar.gz" -C "${WORK_DIR}"
    cd "${WORK_DIR}/openssl-${OPENSSL_VERSION}"

    ./config --prefix="${OPENSSL_DIR}" --openssldir="${OPENSSL_DIR}" shared zlib

    make -j"$(nproc)"
    make install

    rm -f "/etc/ld.so.conf.d/openssl-${OPENSSL_VERSION}.conf"
    echo "${OPENSSL_DIR}/lib64" > "/etc/ld.so.conf.d/openssl-${OPENSSL_VERSION}.conf"

    ldconfig -v

    if ! grep -q "openssl" "${HOME_DIR}/.bash_profile"; then
        {
            echo ""
            echo 'PATH=${PATH}:'"${OPENSSL_DIR}/bin"
            echo "export PATH"
        } >> "${HOME_DIR}/.bash_profile"
    fi

    log_info "OpenSSL ${OPENSSL_VERSION} successfully installed."
fi
