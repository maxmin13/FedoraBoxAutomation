#!/usr/bin/env bats

# Tests for vm/tools/databases/dbeaver.sh
#
# Run from the project root:
#   bats vm/tests/dbeaver.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/databases/dbeaver.sh"

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

    # Default: DBeaver already installed
    _stub rpm  0
    _stub dnf  0
    _stub wget 0

    # curl stub that returns a plausible RPM download URL
    cat > "$TEST_TMPDIR/bin/curl" << 'CURLSTUB'
#!/bin/bash
printf "curl %s\n" "$*" >> "$CALLS_FILE"
echo '"browser_download_url": "https://example.com/dbeaver-ce-x86_64.rpm"'
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

@test "exits 0 when DBeaver is already installed" {
    run bash "$SCRIPT"
    [ "$status" -eq 0 ]
}

@test "skips download when DBeaver is already installed" {
    run bash "$SCRIPT"
    ! grep -q "^curl " "$CALLS_FILE"
}

@test "exits 1 when the GitHub API returns no RPM URL" {
    _stub rpm 1   # not installed — triggers install path
    # curl returns nothing useful
    _stub curl 0
    run bash "$SCRIPT"
    [ "$status" -eq 1 ]
    [[ "$output" == *"Could not determine DBeaver RPM download URL"* ]]
}

@test "calls dnf install when DBeaver is not present" {
    _stub rpm 1
    run bash "$SCRIPT"
    grep -q "^dnf install" "$CALLS_FILE"
}
