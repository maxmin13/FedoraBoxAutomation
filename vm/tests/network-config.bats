#!/usr/bin/env bats

# Tests for vm/setup/network-config.sh
#
# Run from the project root:
#   bats vm/tests/network-config.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/setup/network-config.sh"

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

    _stub ip 0

    # nmcli stub: returns "old-hostname" when queried, records all calls
    cat > "$TEST_TMPDIR/bin/nmcli" << 'NMCLI'
#!/bin/bash
printf "nmcli %s\n" "$*" >> "$CALLS_FILE"
# Return a hostname when queried so the script can compare
[[ "$1 $2" == "general hostname" && "$#" -eq 2 ]] && echo "old-hostname"
exit 0
NMCLI
    # Expand $CALLS_FILE into the stub (it is not set at write time above)
    sed -i "s|\$CALLS_FILE|${CALLS_FILE}|g" "$TEST_TMPDIR/bin/nmcli"
    chmod +x "$TEST_TMPDIR/bin/nmcli"
}

teardown() {
    if [[ -f "$TEST_TMPDIR/common.sh.bak" ]]; then
        mv "$TEST_TMPDIR/common.sh.bak" /tmp/common.sh
    else
        rm -f /tmp/common.sh
    fi
    rm -rf "$TEST_TMPDIR"
}

@test "exits 1 when no hostname argument is provided" {
    run bash "$SCRIPT"
    [ "$status" -eq 1 ]
    [[ "$output" == *"network parameters not found"* ]]
}

@test "exits 0 when hostname is set successfully" {
    run bash "$SCRIPT" new-hostname
    [ "$status" -eq 0 ]
}

@test "calls nmcli to set the hostname when it differs from the current one" {
    run bash "$SCRIPT" new-hostname
    grep -q "^nmcli general hostname new-hostname" "$CALLS_FILE"
}

@test "skips hostname set when it already matches" {
    # Pass the same hostname the stub returns
    run bash "$SCRIPT" old-hostname
    ! grep -q "^nmcli general hostname old-hostname$" "$CALLS_FILE"
}
