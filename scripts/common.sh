#!/bin/bash

set -o errexit
set -o pipefail
set -o nounset
set +o xtrace

exec > >(tee -a /var/log/fedora-box-automation.log) 2>&1

STEP() { echo ; echo ; echo "==\\" ; echo "===>" "$@" ; echo "==/" ; echo ; }
