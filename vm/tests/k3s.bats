#!/usr/bin/env bats

# Tests for vm/tools/containers/k3s.sh
#
# Run from the project root:
#   bats vm/tests/k3s.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/containers/k3s.sh"

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

    # k3s.sh checks the absolute path /usr/local/bin/k3s directly (not PATH),
    # so a PATH-based stub has no effect. Back up any real install and replace
    # it with a stand-in for the default "already installed" state.
    [[ -f /usr/local/bin/k3s ]] && mv /usr/local/bin/k3s "$TEST_TMPDIR/k3s.bin.bak"
    cat > /usr/local/bin/k3s << 'K3SSTUB'
#!/bin/bash
echo "k3s version v1.30.0 (abcdef1 go1.21.0)"
K3SSTUB
    chmod +x /usr/local/bin/k3s

    cat > "$TEST_TMPDIR/bin/curl" << 'CURLSTUB'
#!/bin/bash
printf "curl %s\n" "$*" >> "PLACEHOLDER"
exit 0
CURLSTUB
    sed -i "s|PLACEHOLDER|${CALLS_FILE}|g" "$TEST_TMPDIR/bin/curl"
    chmod +x "$TEST_TMPDIR/bin/curl"
}

teardown() {
    if [[ -f "$TEST_TMPDIR/common.sh.bak" ]]; then
        mv "$TEST_TMPDIR/common.sh.bak" /tmp/common.sh
    else
        rm -f /tmp/common.sh
    fi
    if [[ -f "$TEST_TMPDIR/k3s.bin.bak" ]]; then
        mv "$TEST_TMPDIR/k3s.bin.bak" /usr/local/bin/k3s
    else
        rm -f /usr/local/bin/k3s
    fi
    rm -rf "$TEST_TMPDIR"
}

@test "exits 1 when no login-user argument is provided" {
    run bash "$SCRIPT"
    [ "$status" -eq 1 ]
    [[ "$output" == *"Desktop username is required"* ]]
}

@test "exits 0 when k3s is already installed" {
    run bash "$SCRIPT" root
    [ "$status" -eq 0 ]
}

@test "skips download when k3s is already installed" {
    run bash "$SCRIPT" root
    ! grep -q "^curl " "$CALLS_FILE"
}

@test "downloads k3s install script when k3s is not present" {
    rm -f /usr/local/bin/k3s
    run bash "$SCRIPT" root
    grep -q "^curl " "$CALLS_FILE"
}

@test "does not call systemctl start or enable on k3s" {
    run bash "$SCRIPT" root
    ! grep -qE '^systemctl (start|enable) k3s' "$CALLS_FILE"
}

@test "skips the k3s install script entirely when already installed" {
    run bash "$SCRIPT" root
    [ "$status" -eq 0 ]
    ! grep -q "k3s-install.sh" "$CALLS_FILE"
}

@test "tells the user k3s is not enabled or started" {
    run bash "$SCRIPT" root
    [[ "$output" == *"k3s is installed but not enabled or started."* ]]
}

@test "gives manual start instructions" {
    run bash "$SCRIPT" root
    [[ "$output" == *"systemctl start k3s"* ]]
}
