#!/bin/bash

##
## Description: Installs build dependencies and builds OpenSSL 3.3.2 from
##              source to /usr/local/ssl. Adds /usr/local/ssl/bin to the
##              login user's PATH in ~/.bash_profile. The binary is built
##              with RPATH so it finds its own libraries without touching the
##              system linker cache (ldconfig), keeping system tools unaffected.
##              Skips the build if the same version is already installed; exits
##              with code 2 if a different version is found (pass --force to
##              overwrite) or if the openssl-libs RPM is already installed.
## Usage:       sudo ./openssl.sh <login-user> [--force]
## Parameters:  $1  <login-user>  Non-root desktop username (e.g. maxmin)
##              $2  --force       Overwrite an existing installation (optional)
##

source /tmp/common.sh

LOGIN_USER="${1:-}"
FORCE="${2:-}"
require_login_user "${LOGIN_USER}"
HOME_DIR=$(eval echo "~${LOGIN_USER}")
OPENSSL_VERSION="3.3.2"
OPENSSL_DIR="/usr/local/ssl"

####
STEP "OpenSSL"
####

if [[ -x "${OPENSSL_DIR}/bin/openssl" ]] && \
   "${OPENSSL_DIR}/bin/openssl" version 2>/dev/null | grep -q "${OPENSSL_VERSION}"
then
    log_info "OpenSSL ${OPENSSL_VERSION} already installed at ${OPENSSL_DIR}. Nothing to do."
elif [[ -x "${OPENSSL_DIR}/bin/openssl" ]] && [[ "${FORCE}" != "--force" ]]; then
    EXISTING=$("${OPENSSL_DIR}/bin/openssl" version 2>/dev/null || echo "unknown version")
    log_error "A different version of OpenSSL is already installed at ${OPENSSL_DIR} (${EXISTING}). Use 'Install anyway' to replace it."
    exit 2
elif rpm -q openssl-libs &>/dev/null && [[ "${FORCE}" != "--force" ]]; then
    EXISTING=$(rpm -q openssl-libs --queryformat '%{VERSION}' 2>/dev/null || echo "unknown version")
    log_error "System OpenSSL libraries are already installed (openssl-libs ${EXISTING}). Use 'Install anyway' to add OpenSSL ${OPENSSL_VERSION} at ${OPENSSL_DIR} alongside it."
    exit 2
else
    if ! dnf install -y gcc make perl-core zlib-devel; then
        log_error "Failed to install build dependencies. Check the log above for details."
        exit 1
    fi

    WORK_DIR=$(mktemp -d)
    trap 'rm -rf "${WORK_DIR}"' EXIT

    log_info "Installing OpenSSL ${OPENSSL_VERSION} ..."

    mkdir -p "${OPENSSL_DIR}"

    OPENSSL_URL="https://www.openssl.org/source/openssl-${OPENSSL_VERSION}.tar.gz"
    log_info "Downloading OpenSSL ${OPENSSL_VERSION} from ${OPENSSL_URL} ..."
    wget -q --tries=3 "${OPENSSL_URL}" -O "${WORK_DIR}/openssl.tar.gz"
    tar -xf "${WORK_DIR}/openssl.tar.gz" -C "${WORK_DIR}"
    cd "${WORK_DIR}/openssl-${OPENSSL_VERSION}"

    ./config --prefix="${OPENSSL_DIR}" --openssldir="${OPENSSL_DIR}" shared zlib \
        -Wl,-rpath,"${OPENSSL_DIR}/lib64"

    make -j"$(nproc)"
    make install

    if ! grep -q "openssl" "${HOME_DIR}/.bash_profile"; then
        {
            echo ""
            echo 'PATH=${PATH}:'"${OPENSSL_DIR}/bin"
            echo "export PATH"
        } >> "${HOME_DIR}/.bash_profile"
    fi

    log_info "OpenSSL ${OPENSSL_VERSION} successfully installed."
fi

####
STEP "Sanity checks"
####

FAIL=0

if [[ ! -x "${OPENSSL_DIR}/bin/openssl" ]]; then
    log_error "Binary not found: ${OPENSSL_DIR}/bin/openssl"
    FAIL=1
else
    INSTALLED=$("${OPENSSL_DIR}/bin/openssl" version 2>/dev/null || true)
    if echo "${INSTALLED}" | grep -q "${OPENSSL_VERSION}"; then
        log_info "Binary  : ${INSTALLED}"
    else
        log_error "Version mismatch: expected ${OPENSSL_VERSION}, got '${INSTALLED}'"
        FAIL=1
    fi
fi

if [[ ! -f "${OPENSSL_DIR}/openssl.cnf" ]]; then
    log_error "Config not found: ${OPENSSL_DIR}/openssl.cnf"
    FAIL=1
else
    log_info "Config  : ${OPENSSL_DIR}/openssl.cnf"
fi

if echo "sanity" | "${OPENSSL_DIR}/bin/openssl" dgst -sha256 &>/dev/null; then
    log_info "SHA-256 : OK"
else
    log_error "SHA-256 digest test failed — RPATH or library issue"
    FAIL=1
fi

RPATH_LIB=$(ldd "${OPENSSL_DIR}/bin/openssl" 2>/dev/null | grep libssl | awk '{print $3}')
if echo "${RPATH_LIB}" | grep -q "${OPENSSL_DIR}/lib64"; then
    log_info "RPATH   : libssl loaded from ${RPATH_LIB}"
else
    log_error "RPATH broken: libssl resolved to '${RPATH_LIB}' instead of ${OPENSSL_DIR}/lib64"
    FAIL=1
fi

if echo "test" | "${OPENSSL_DIR}/bin/openssl" enc -aes-256-cbc -pbkdf2 -pass pass:x 2>/dev/null \
    | "${OPENSSL_DIR}/bin/openssl" enc -d -aes-256-cbc -pbkdf2 -pass pass:x 2>/dev/null \
    | grep -q "test"; then
    log_info "AES-256 : encrypt/decrypt roundtrip OK"
else
    log_error "AES-256 encrypt/decrypt roundtrip failed"
    FAIL=1
fi

if "${OPENSSL_DIR}/bin/openssl" req -x509 -newkey rsa:2048 -nodes -days 1 \
    -keyout /dev/null -out /tmp/openssl-sanity.crt \
    -subj "/CN=sanity-check" &>/dev/null; then
    log_info "RSA/X509: self-signed certificate OK"
    rm -f /tmp/openssl-sanity.crt
else
    log_error "Self-signed certificate generation failed"
    FAIL=1
fi

if [[ "${FAIL}" -eq 1 ]]; then
    log_error "One or more sanity checks failed."
    exit 1
fi

log_info "All sanity checks passed."
log_info "---"
log_info "Next steps:"
log_info "  Check version  : ${OPENSSL_DIR}/bin/openssl version"
log_info "  Generate cert  : openssl req -x509 -newkey rsa:2048 -nodes -days 365 -keyout key.pem -out cert.pem -subj '/CN=localhost'"
log_info "  Encrypt file   : openssl enc -aes-256-cbc -pbkdf2 -in plain.txt -out enc.bin"
log_info "  Decrypt file   : openssl enc -d -aes-256-cbc -pbkdf2 -in enc.bin -out plain.txt"
log_info "  Check TLS site : openssl s_client -connect example.com:443"
log_info "  SHA-256 hash   : openssl dgst -sha256 <file>"
log_info "  Installed at   : ${OPENSSL_DIR}"
log_info "  Note: run 'source ~/.bash_profile' (or log out and back in) to get openssl on PATH."
log_info "---"
