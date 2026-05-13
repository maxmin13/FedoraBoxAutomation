#!/usr/bin/env bats

# Tests for vm/tools/ides/eclipse-ee.sh
#
# Run from the project root:
#   bats vm/tests/eclipse-ee.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/ides/eclipse-ee.sh"

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

    _stub wget 0
    _stub tar  0

    # Default: Eclipse Enterprise installer already downloaded
    mkdir -p /opt/eclipse-installer
    printf '#!/bin/bash\necho "Eclipse Installer"\n' > /opt/eclipse-installer/eclipse-inst
    chmod +x /opt/eclipse-installer/eclipse-inst
}

teardown() {
    if [[ -f "$TEST_TMPDIR/common.sh.bak" ]]; then
        mv "$TEST_TMPDIR/common.sh.bak" /tmp/common.sh
    else
        rm -f /tmp/common.sh
    fi
    rm -rf /opt/eclipse-installer
    rm -f /usr/share/applications/eclipse-installer.desktop
    rm -rf "$TEST_TMPDIR"
}

@test "exits 0 when Eclipse Enterprise installer is already present" {
    run bash "$SCRIPT"
    [ "$status" -eq 0 ]
}

@test "skips wget when Eclipse Enterprise installer is already present" {
    run bash "$SCRIPT"
    ! grep -q "^wget " "$CALLS_FILE"
}

@test "removes an incomplete installer directory and calls wget" {
    # Directory exists but eclipse-inst is not executable — incomplete download
    rm -f /opt/eclipse-installer/eclipse-inst
    touch /opt/eclipse-installer/eclipse-inst   # file exists, not executable
    run bash "$SCRIPT"
    grep -q "^wget " "$CALLS_FILE"
}

@test "calls wget when the installer is not present" {
    rm -rf /opt/eclipse-installer
    run bash "$SCRIPT"
    grep -q "^wget " "$CALLS_FILE"
}

@test "accepts an explicit release argument" {
    rm -rf /opt/eclipse-installer
    run bash "$SCRIPT" 2025-06
    grep -q "2025-06" "$CALLS_FILE"
}
