#!/usr/bin/env bats

# Tests for vm/tools/browsers/chrome.sh
#
# Run from the project root:
#   bats vm/tests/chrome.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/browsers/chrome.sh"

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

    # Default: Chrome already installed
    _stub rpm 0
    _stub dnf 0
}

teardown() {
    if [[ -f "$TEST_TMPDIR/common.sh.bak" ]]; then
        mv "$TEST_TMPDIR/common.sh.bak" /tmp/common.sh
    else
        rm -f /tmp/common.sh
    fi
    rm -rf "$TEST_TMPDIR"
}

@test "exits 0 when Chrome is already installed" {
    run bash "$SCRIPT"
    [ "$status" -eq 0 ]
}

@test "skips dnf install when Chrome is already installed" {
    run bash "$SCRIPT"
    ! grep -q "^dnf install" "$CALLS_FILE"
}

@test "installs Chrome when not present" {
    _stub rpm 1   # exit 1 = package not found
    run bash "$SCRIPT"
    grep -q "^dnf install -y google-chrome-stable" "$CALLS_FILE"
}

@test "enables the google-chrome repo before installing" {
    _stub rpm 1
    run bash "$SCRIPT"
    grep -q "^dnf config-manager enable google-chrome" "$CALLS_FILE"
}
