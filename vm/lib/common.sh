#!/bin/bash

##
## Description: Shared library sourced by all provisioning scripts. Enables
##              strict error handling, tees all output to
##              /var/log/fedora-box-automation.log, and provides structured
##              logging functions: log_info, log_warn, log_error, and STEP.
## Usage:       source /tmp/common.sh  (do not execute directly)
##
## Exit codes (used by all scripts that source this file):
##   0  success
##   1  unrecoverable failure (script aborted mid-run)
##   2  prerequisite not met; a required earlier step must be run first
##      (e.g. tomcat.sh requires java.sh, minikube.sh requires docker.sh)
##

set -o errexit
set -o pipefail
set -o nounset
set +o xtrace

if [[ "$(id -u)" -ne 0 ]]; then
    # Emit to both stderr and stdout so the GUI output scanner sees it.
    printf 'ERROR: %s\n' 'This script must be run as root.' | tee /dev/stderr
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

# Catch any command that exits non-zero under set -o errexit and emit an
# ERROR: line before the script terminates.  This ensures the GUI output
# scanner always sees a human-readable ERROR: line even when the failure
# comes from a low-level command (wget, dnf, tar, …) that does not call
# log_error itself.
# Note: individual scripts may still call log_error + exit for explicit
# checks; this handler is only the safety net for unexpected failures.
_on_error() {
    local code=$? line="${BASH_LINENO[0]}" cmd="${BASH_COMMAND}"
    log_error "Command failed (exit ${code}, line ${line}): ${cmd}"
}
trap '_on_error' ERR

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
