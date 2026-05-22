#!/bin/bash

##
## Description: Installs build dependencies and builds OpenSSL 3.3.2 from
##              source to /usr/local/ssl. Adds it to the login user's PATH
##              in ~/.bash_profile. Skips the build if already installed.
## Usage:       sudo ./openssl.sh <login-user>
## Parameters:  $1  <login-user>  Non-root desktop username (e.g. maxmin)
##

source /tmp/common.sh

LOGIN_USER="${1:-}"
require_login_user "${LOGIN_USER}"
HOME_DIR=$(eval echo "~${LOGIN_USER}")
OPENSSL_VERSION="3.3.2"
OPENSSL_DIR="/usr/local/ssl"

####
STEP "OpenSSL"
####

dnf groupinstall -y "Development Tools"
dnf install -y perl-core zlib-devel

if [[ -x "${OPENSSL_DIR}/bin/openssl" ]] && \
   "${OPENSSL_DIR}/bin/openssl" version 2>/dev/null | grep -q "${OPENSSL_VERSION}"
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

log_info "Version : ${OPENSSL_DIR}/bin/openssl version"
log_info "Install : ${OPENSSL_DIR}"
log_info "Config  : ${OPENSSL_DIR}/openssl.cnf"
