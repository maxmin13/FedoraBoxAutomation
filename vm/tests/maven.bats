#!/usr/bin/env bats

# Tests for vm/tools/build-tools/maven.sh
#
# Run from the project root:
#   bats vm/tests/maven.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/build-tools/maven.sh"

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

    # Default: Maven already installed — create the sentinel binary
    mkdir -p /opt/maven/bin
    printf '#!/bin/bash\necho "Apache Maven 3.9.5"\n' > /opt/maven/bin/mvn
    chmod +x /opt/maven/bin/mvn
}

teardown() {
    if [[ -f "$TEST_TMPDIR/common.sh.bak" ]]; then
        mv "$TEST_TMPDIR/common.sh.bak" /tmp/common.sh
    else
        rm -f /tmp/common.sh
    fi
    rm -rf /opt/maven
    rm -rf "$TEST_TMPDIR"
}

@test "exits 0 when Maven is already installed" {
    run bash "$SCRIPT"
    [ "$status" -eq 0 ]
}

@test "skips wget when Maven is already installed" {
    run bash "$SCRIPT"
    ! grep -q "^wget " "$CALLS_FILE"
}

@test "downloads Maven when not installed" {
    rm -rf /opt/maven   # remove the sentinel so the install path runs
    run bash "$SCRIPT"
    grep -q "^wget " "$CALLS_FILE"
}

@test "accepts an explicit version argument" {
    rm -rf /opt/maven
    run bash "$SCRIPT" 3.8.8
    grep -q "3.8.8" "$CALLS_FILE"
}
