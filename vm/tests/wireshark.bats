#!/usr/bin/env bats

# Tests for vm/tools/network/wireshark.sh
#
# Run from the project root:
#   bats vm/tests/wireshark.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/network/wireshark.sh"

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
STUB

    # Default: Wireshark installed, user already in wireshark group
    _stub rpm     0
    _stub dnf     0
    _stub usermod 0
    # id -nG returns groups including wireshark
    printf '#!/bin/bash\n[[ "$1" == "-u" ]] && echo 0 && exit 0\n[[ "$1" == "-nG" ]] && echo "users wheel wireshark" && exit 0\n' \
        > "$TEST_TMPDIR/bin/id"
    chmod +x "$TEST_TMPDIR/bin/id"
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
    [[ "$output" == *"login user not found"* ]]
}

@test "exits 0 when Wireshark is already installed" {
    run bash "$SCRIPT" testuser
    [ "$status" -eq 0 ]
}

@test "skips dnf install when Wireshark is already installed" {
    run bash "$SCRIPT" testuser
    ! grep -q "^dnf install" "$CALLS_FILE"
}

@test "installs Wireshark when not present" {
    _stub rpm 1   # exit 1 = package not found
    run bash "$SCRIPT" testuser
    grep -q "^dnf install -y wireshark" "$CALLS_FILE"
}

@test "adds user to wireshark group when not already a member" {
    # id -nG returns groups without wireshark
    printf '#!/bin/bash\n[[ "$1" == "-u" ]] && echo 0 && exit 0\n[[ "$1" == "-nG" ]] && echo "users wheel" && exit 0\n' \
        > "$TEST_TMPDIR/bin/id"
    run bash "$SCRIPT" testuser
    grep -q "^usermod -aG wireshark testuser" "$CALLS_FILE"
}

@test "skips usermod when user is already in wireshark group" {
    run bash "$SCRIPT" testuser
    ! grep -q "^usermod " "$CALLS_FILE"
}
