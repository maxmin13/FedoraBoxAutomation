#!/bin/bash

##
## Description: Installs Node.js via the NodeSource RPM repository.
##              Any conflicting system nodejs packages are removed first.
##              Both node and npm land in /usr/bin; no PATH configuration
##              is required.
## Usage:       sudo ./node.sh <login-user> [major-version]
## Parameters:  $1  <login-user>    Non-root desktop username (e.g. maxmin)
##              $2  [major-version] Node.js major version to install (default: latest LTS)
##                                  Pass 'latest' to auto-resolve the current LTS major.
##

source /tmp/common.sh

LOGIN_USER="${1:-}"
require_login_user "${LOGIN_USER}"
NODE_MAJOR="${2:-latest}"

if [[ "${NODE_MAJOR}" == 'latest' ]]; then
    log_info "Querying nodejs.org for the latest LTS major version ..."
    NODE_MAJOR=$(curl -fsSL "https://nodejs.org/dist/index.json" | python3 -c "
import sys, json
data = json.load(sys.stdin)
lts = next((v for v in data if v['lts']), None)
print(lts['version'].split('.')[0].lstrip('v') if lts else '')
")
    if [[ -z "${NODE_MAJOR}" ]]; then
        log_error "Could not determine the latest Node.js LTS major version. Check network connectivity."
        exit 1
    fi
    log_info "Latest LTS major version: ${NODE_MAJOR}"
fi

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
    # Remove any installed nodejs packages before setting up NodeSource.
    # Fedora 44+ ships nodejs24-bin and nodejs24-npm-bin which file-conflict
    # with NodeSource packages for all major versions.  --allowerasing does
    # not resolve file-level RPM conflicts; explicit removal is required.
    INSTALLED_NODEJS_PKGS="$(rpm -qa --qf '%{NAME}\n' | grep '^nodejs' || true)"
    if [[ -n "${INSTALLED_NODEJS_PKGS}" ]]; then
        log_info "Removing existing nodejs packages to avoid conflicts ..."
        # Word-splitting is intentional: one package name per line.
        # shellcheck disable=SC2086
        dnf remove -y ${INSTALLED_NODEJS_PKGS}
    fi

    log_info "Setting up NodeSource repository for Node.js ${NODE_MAJOR}.x ..."
    curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    dnf install -y nodejs
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
