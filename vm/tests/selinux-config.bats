#!/usr/bin/env bats

# Tests for vm/setup/selinux-config.sh
#
# Run from the project root:
#   bats vm/tests/selinux-config.bats
#
# The test stubs out all external commands (rpm, dnf, systemctl, sestatus)
# and replaces /tmp/common.sh with a minimal stand-in that provides the
# log functions without the root check or exec redirect.

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/setup/selinux-config.sh"

# ── Stub helper ────────────────────────────────────────────────────────────────
# Creates an executable stub at $TEST_TMPDIR/bin/<name> that:
#   - records every call (name + args) to $CALLS_FILE
#   - exits with the given exit code
_stub() {
    local name="$1" exit_code="${2:-0}"
    printf '#!/bin/bash\nprintf "%%s %%s\\n" "%s" "$*" >> "%s"\nexit %d\n' \
        "$name" "$CALLS_FILE" "$exit_code" > "$TEST_TMPDIR/bin/$name"
    chmod +x "$TEST_TMPDIR/bin/$name"
}

# ── Setup / teardown ───────────────────────────────────────────────────────────

setup() {
    TEST_TMPDIR="$(mktemp -d)"
    export CALLS_FILE="$TEST_TMPDIR/calls.log"
    touch "$CALLS_FILE"

    mkdir -p "$TEST_TMPDIR/bin"
    export PATH="$TEST_TMPDIR/bin:$PATH"

    # Replace /tmp/common.sh with a minimal stub.
    # Preserves any real file so teardown can restore it.
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

    # Default stubs: all commands succeed; rpm reports audit already installed
    _stub sestatus  0
    _stub rpm       0   # exit 0 = package found = already installed
    _stub dnf       0
    _stub systemctl 0
}

teardown() {
    if [[ -f "$TEST_TMPDIR/common.sh.bak" ]]; then
        mv "$TEST_TMPDIR/common.sh.bak" /tmp/common.sh
    else
        rm -f /tmp/common.sh
    fi
    rm -rf "$TEST_TMPDIR"
}

# ── Tests ──────────────────────────────────────────────────────────────────────

@test "exits 0 when audit tools are already installed" {
    run bash "$SCRIPT"
    [ "$status" -eq 0 ]
}

@test "skips dnf install when audit is already installed" {
    # rpm exits 0 = package present, so dnf must not be called
    run bash "$SCRIPT"
    ! grep -q "^dnf " "$CALLS_FILE"
}

@test "runs dnf install when audit is not installed" {
    _stub rpm 1   # exit 1 = package not found
    run bash "$SCRIPT"
    grep -q "^dnf " "$CALLS_FILE"
}

@test "always runs sestatus" {
    run bash "$SCRIPT"
    grep -q "^sestatus" "$CALLS_FILE"
}

@test "always starts the auditd service" {
    run bash "$SCRIPT"
    grep -q "^systemctl start auditd" "$CALLS_FILE"
}

@test "exits non-zero when systemctl fails" {
    _stub systemctl 1
    run bash "$SCRIPT"
    [ "$status" -ne 0 ]
}

@test "exits non-zero when dnf install fails" {
    _stub rpm 1   # triggers dnf
    _stub dnf 1   # dnf fails
    run bash "$SCRIPT"
    [ "$status" -ne 0 ]
}
