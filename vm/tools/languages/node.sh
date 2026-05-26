#!/bin/bash

##
## Description: Installs Node.js via the system repo (Fedora) when it ships
##              the requested major version, or via the NodeSource RPM
##              repository otherwise.  Both node and npm land in /usr/bin;
##              no PATH configuration is required.
## Usage:       sudo ./node.sh <login-user> [major-version]
## Parameters:  $1  <login-user>    Non-root desktop username (e.g. maxmin)
##              $2  [major-version] Node.js major version to install
##                                  (default: 22)
##

source /tmp/common.sh

LOGIN_USER="${1:-}"
require_login_user "${LOGIN_USER}"
NODE_MAJOR="${2:-22}"

####
STEP "Node.js ${NODE_MAJOR}.x"
####

INSTALLED_MAJOR=''
if command -v node > /dev/null 2>&1; then
    INSTALLED_MAJOR="$(node --version 2>/dev/null | sed 's/^v//' | cut -d. -f1)"
fi

if [[ "${INSTALLED_MAJOR}" == "${NODE_MAJOR}" ]]; then
    log_info "Node.js ${NODE_MAJOR}.x already installed: $(node --version)"
else
    # Remove any installed Fedora nodejs packages before installing the
    # requested version.  Fedora 44+ ships nodejs24-bin and nodejs24-npm-bin
    # which file-conflict with NodeSource packages for other major versions.
    # --allowerasing does not resolve file-level RPM conflicts; explicit
    # removal is required.
    INSTALLED_NODEJS_PKGS="$(rpm -qa --qf '%{NAME}\n' | grep '^nodejs' || true)"
    if [[ -n "${INSTALLED_NODEJS_PKGS}" ]]; then
        log_info "Removing existing nodejs packages to avoid conflicts ..."
        # Word-splitting is intentional: one package name per line.
        # shellcheck disable=SC2086
        dnf remove -y ${INSTALLED_NODEJS_PKGS}
    fi

    # Check whether the Fedora system repo ships the requested major.
    # Use --disablerepo=nodesource* to exclude any NodeSource repo that may
    # have been added by a previous failed run of this script.
    REPO_MAJOR="$(dnf info --disablerepo='nodesource*' nodejs 2>/dev/null \
        | awk '/^Version/{v=$3} END{print v}' \
        | sed 's/^[0-9]*://' \
        | cut -d. -f1)"

    if [[ "${REPO_MAJOR}" == "${NODE_MAJOR}" ]]; then
        log_info "Installing Node.js ${NODE_MAJOR}.x from Fedora repo ..."
        dnf install -y nodejs
    else
        log_info "Fedora repo offers Node.js ${REPO_MAJOR:-unknown}.x; using NodeSource for ${NODE_MAJOR}.x ..."
        curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
        dnf install -y nodejs
    fi
    log_info "Node.js $(node --version) installed."
fi

node --version
npm --version

log_info "-------------------------------------------------------"
log_info " Node.js ${NODE_MAJOR}.x quick-reference"
log_info "-------------------------------------------------------"
log_info " Version          : node --version"
log_info " npm version      : npm --version"
log_info " Run a script     : node <file.js>"
log_info " Interactive REPL : node"
log_info ""
log_info " Package management:"
log_info "   npm install <pkg>          install locally"
log_info "   npm install -g <pkg>       install globally"
log_info "   npm init -y                create package.json"
log_info "   npm list -g --depth=0      list global packages"
log_info ""
log_info " Hello World:"
log_info "   echo \"console.log('Hello, World!')\" > /tmp/hello.js"
log_info "   node /tmp/hello.js"
log_info ""
log_info " Built-in HTTP server:"
log_info "   node -e \"require('http').createServer((_, r) => r.end('OK')).listen(3000)\""
log_info "   curl http://localhost:3000"
log_info "-------------------------------------------------------"
