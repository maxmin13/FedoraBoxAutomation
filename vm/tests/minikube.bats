#!/usr/bin/env bats

# Tests for vm/tools/containers/minikube.sh
#
# Run from the project root:
#   bats vm/tests/minikube.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/containers/minikube.sh"

_stub() {
    local name="$1" exit_code="${2:-0}"
    printf '#!/bin/bash\nprintf "%%s %%s\\n" "%s" "$*" >> "%s"\nexit %d\n' \
        "$name" "$CALLS_FILE" "$exit_code" > "$TEST_TMPDIR/bin/$name"
    chmod +x "$TEST_TMPDIR/bin/$name"
}

setup() {
    TEST_TMPDIR="$(mktemp -d)"
    export CALLS_FILE="$TEST_TMPDIR/calls.log"
    touch "$CALLS_FILE"
    mkdir -p "$TEST_TMPDIR/bin"
    export PATH="$TEST_TMPDIR/bin:$PATH"

    [[ -f /tmp/common.sh ]] && cp /tmp/common.sh "$TEST_TMPDIR/common.sh.bak"
    cat > /tmp/common.sh << 'STUB'
#!/bin/bash
set -o errexit -o pipefail
SCRIPT_NAME="$(basename "${BASH_SOURCE[1]:-$0}")"
_log() { printf '%s [%-5s] %s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" "$SCRIPT_NAME" "${*:2}"; }
log_info()  { _log INFO  "$@"; }
log_warn()  { _log WARN  "$@"; }
log_error() { _log ERROR "$@"; }
STEP()      { echo; _log STEP "===[ $* ]==="; echo; }
require_login_user() {
    local user="${1:-}"
    if [[ -z "${user}" ]]; then
        log_error 'Desktop username is required as the first argument.'
        exit 1
    fi
}
STUB

    # Default: Docker, minikube, kubectl all already installed
    _stub docker   0
    _stub minikube 0
    _stub kubectl  0
    _stub sudo     0
    _stub wget     0
    _stub chmod    0

    # curl stub returns a plausible kubectl version string
    cat > "$TEST_TMPDIR/bin/curl" << 'CURLSTUB'
#!/bin/bash
printf "curl %s\n" "$*" >> "$CALLS_FILE"
echo "v1.30.0"
exit 0
CURLSTUB
    sed -i "s|\$CALLS_FILE|${CALLS_FILE}|g" "$TEST_TMPDIR/bin/curl"
    chmod +x "$TEST_TMPDIR/bin/curl"
}

teardown() {
    if [[ -f "$TEST_TMPDIR/common.sh.bak" ]]; then
        mv "$TEST_TMPDIR/common.sh.bak" /tmp/common.sh
    else
        rm -f /tmp/common.sh
    fi
    rm -rf "$TEST_TMPDIR"
}

@test "exits 1 when no login-user argument is provided" {
    run bash "$SCRIPT"
    [ "$status" -eq 1 ]
    [[ "$output" == *"Desktop username is required"* ]]
}

@test "exits 2 when Docker is not installed" {
    _stub docker 1   # exit 1 = docker not found
    run bash "$SCRIPT" testuser
    [ "$status" -eq 2 ]
    [[ "$output" == *"Docker is not installed"* ]]
    [[ "$output" == *"docker.sh"* ]]
    [[ "$output" == *"minikube.sh"* ]]
}

@test "exits 0 when Docker, minikube, and kubectl are all present" {
    run bash "$SCRIPT" testuser
    [ "$status" -eq 0 ]
}

@test "skips minikube download when already installed" {
    run bash "$SCRIPT" testuser
    ! grep -q "minikube-linux-amd64" "$CALLS_FILE"
}

@test "downloads minikube when not installed" {
    _stub minikube 1   # exit 1 = minikube not found
    run bash "$SCRIPT" testuser
    grep -q "minikube-linux-amd64" "$CALLS_FILE"
}

@test "skips kubectl download when already installed" {
    run bash "$SCRIPT" testuser
    ! grep -q "dl.k8s.io" "$CALLS_FILE"
}

@test "downloads kubectl when not installed" {
    _stub kubectl 1   # exit 1 = kubectl not found
    run bash "$SCRIPT" testuser
    grep -q "kubectl" "$CALLS_FILE"
}
