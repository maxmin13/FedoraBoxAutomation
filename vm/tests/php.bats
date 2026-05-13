#!/usr/bin/env bats

# Tests for vm/tools/languages/php.sh
#
# Run from the project root:
#   bats vm/tests/php.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/languages/php.sh"

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

    # Default: PHP already installed
    _stub rpm 0
    _stub dnf 0
    _stub php 0
    _stub sed 0

    # php.sh writes to /etc/php.ini — back it up and provide a clean copy
    [[ -f /etc/php.ini ]] && cp /etc/php.ini "$TEST_TMPDIR/php.ini.bak"
    touch /etc/php.ini
}

teardown() {
    if [[ -f "$TEST_TMPDIR/common.sh.bak" ]]; then
        mv "$TEST_TMPDIR/common.sh.bak" /tmp/common.sh
    else
        rm -f /tmp/common.sh
    fi
    if [[ -f "$TEST_TMPDIR/php.ini.bak" ]]; then
        mv "$TEST_TMPDIR/php.ini.bak" /etc/php.ini
    else
        rm -f /etc/php.ini
    fi
    rm -rf "$TEST_TMPDIR"
}

@test "exits 1 when no login-user argument is provided" {
    run bash "$SCRIPT"
    [ "$status" -eq 1 ]
    [[ "$output" == *"login user not found"* ]]
}

@test "exits 0 when PHP is already installed" {
    run bash "$SCRIPT" testuser
    [ "$status" -eq 0 ]
}

@test "skips dnf install when PHP is already installed" {
    run bash "$SCRIPT" testuser
    ! grep -q "^dnf install" "$CALLS_FILE"
}

@test "installs PHP packages when not present" {
    _stub rpm 1   # exit 1 = package not found
    run bash "$SCRIPT" testuser
    grep -q "^dnf install -y php php-common php-cli" "$CALLS_FILE"
}

@test "always writes apc.enabled=0 to /etc/php.ini" {
    run bash "$SCRIPT" testuser
    grep -q 'apc.enabled=0' /etc/php.ini
}
