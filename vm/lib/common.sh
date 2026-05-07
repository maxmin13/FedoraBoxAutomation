#!/bin/bash

##
## Description: Shared library sourced by all provisioning scripts. Enables
##              strict error handling, tees all output to
##              /var/log/fedora-box-automation.log, and provides structured
##              logging functions: log_info, log_warn, log_error, and STEP.
## Usage:       source /tmp/common.sh  (do not execute directly)
##

set -o errexit
set -o pipefail
set -o nounset
set +o xtrace

if [[ "$(id -u)" -ne 0 ]]; then
    echo 'ERROR: This script must be run as root.' >&2
    exit 1
fi

exec > >(tee -a /var/log/fedora-box-automation.log) 2>&1

SCRIPT_NAME="$(basename "${BASH_SOURCE[1]:-$0}")"

_log() {
    local level="$1"; shift
    printf '%s [%-5s] %-22s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "${level}" "${SCRIPT_NAME}" "$*"
}

log_info()  { _log 'INFO'  "$@"; }
log_warn()  { _log 'WARN'  "$@"; }
log_error() { _log 'ERROR' "$@"; }
STEP()      { echo; _log 'STEP' "===[ $* ]==="; echo; }
