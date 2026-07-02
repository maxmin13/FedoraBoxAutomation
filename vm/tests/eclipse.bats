#!/usr/bin/env bats

# Tests for vm/tools/ides/eclipse.sh
#
# Run from the project root:
#   bats vm/tests/eclipse.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/ides/eclipse.sh"

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
    _stub java 0

    # Default: Eclipse already installed — create the sentinel executable
    mkdir -p /opt/eclipse-2026-03
    printf '#!/bin/bash\necho "Eclipse IDE"\n' > /opt/eclipse-2026-03/eclipse
    chmod +x /opt/eclipse-2026-03/eclipse
}

teardown() {
    if [[ -f "$TEST_TMPDIR/common.sh.bak" ]]; then
        mv "$TEST_TMPDIR/common.sh.bak" /tmp/common.sh
    else
        rm -f /tmp/common.sh
    fi
    rm -rf /opt/eclipse-2026-03
    rm -f /usr/bin/eclipse /usr/share/applications/eclipse.desktop
    rm -rf "$TEST_TMPDIR"
}

@test "exits 0 when Eclipse is already installed" {
    run bash "$SCRIPT" 2026-03
    [ "$status" -eq 0 ]
}

@test "skips wget when Eclipse is already installed" {
    run bash "$SCRIPT" 2026-03
    ! grep -q "^wget " "$CALLS_FILE"
}

@test "removes an incomplete installation and calls wget" {
    # Directory exists but binary is not executable — incomplete install
    rm -f /opt/eclipse-2026-03/eclipse
    touch /opt/eclipse-2026-03/eclipse   # file exists, not executable
    run bash "$SCRIPT" 2026-03
    grep -q "^wget " "$CALLS_FILE"
}

@test "calls wget when Eclipse is not installed" {
    rm -rf /opt/eclipse-2026-03
    run bash "$SCRIPT" 2026-03
    grep -q "^wget " "$CALLS_FILE"
}

@test "accepts an explicit release argument" {
    rm -rf /opt/eclipse-2026-03
    run bash "$SCRIPT" 2025-06
    grep -q "2025-06" "$CALLS_FILE"
}
