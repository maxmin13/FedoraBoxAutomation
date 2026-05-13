#!/usr/bin/env bats

# Tests for vm/tools/cloud/ecs-cli.sh
#
# Run from the project root:
#   bats vm/tests/ecs-cli.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/cloud/ecs-cli.sh"

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

    # Default: ECS CLI already installed
    _stub ecs-cli 0
    _stub curl    0
    _stub chmod   0
}

teardown() {
    if [[ -f "$TEST_TMPDIR/common.sh.bak" ]]; then
        mv "$TEST_TMPDIR/common.sh.bak" /tmp/common.sh
    else
        rm -f /tmp/common.sh
    fi
    rm -rf "$TEST_TMPDIR"
}

@test "exits 0 when ECS CLI is already installed" {
    run bash "$SCRIPT"
    [ "$status" -eq 0 ]
}

@test "skips curl download when ECS CLI is already installed" {
    run bash "$SCRIPT"
    ! grep -q "^curl " "$CALLS_FILE"
}

@test "downloads the ECS CLI binary when not installed" {
    _stub ecs-cli 1   # exit 1 = not found
    run bash "$SCRIPT"
    grep -q "^curl " "$CALLS_FILE"
}

@test "makes the binary executable after downloading" {
    _stub ecs-cli 1
    run bash "$SCRIPT"
    grep -q "^chmod " "$CALLS_FILE"
}
