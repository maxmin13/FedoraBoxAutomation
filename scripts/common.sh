#!/bin/bash

set -o errexit
set -o pipefail
set -o nounset
set +o xtrace

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
