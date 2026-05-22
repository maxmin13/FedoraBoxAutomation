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

LOG_FILE="${FEDORA_BOX_LOG:-/var/log/fedora-box-automation.log}"
exec > >(tee -a "$LOG_FILE") 2>&1

SCRIPT_NAME="$(basename "${BASH_SOURCE[1]:-$0}")"

_log() {
    local level="$1"; shift
    printf '%s [%-5s] %-22s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "${level}" "${SCRIPT_NAME}" "$*"
}

log_info()  { _log 'INFO'  "$@"; }
log_warn()  { _log 'WARN'  "$@"; }
log_error() { _log 'ERROR' "$@"; printf 'ERROR: %s\n' "$*"; }
STEP()      { echo; _log 'STEP' "===[ $* ]==="; echo; }

require_login_user() {
    local user="${1:-}"
    if [[ -z "${user}" ]]; then
        log_error 'Desktop username is required as the first argument.'
        exit 1
    fi
    if ! id "${user}" &>/dev/null; then
        log_error "Desktop user '${user}' does not exist on this system. Verify the username and try again."
        exit 1
    fi
}
