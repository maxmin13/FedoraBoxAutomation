#!/usr/bin/env bats

# Tests for vm/tools/editors/vim.sh
#
# Run from the project root:
#   bats vm/tests/vim.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/editors/vim.sh"

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
require_login_user() {
    local user="${1:-}"
    if [[ -z "${user}" ]]; then
        log_error 'Desktop username is required as the first argument.'
        exit 1
    fi
}
STUB

    _stub dnf     0
    _stub chown   0
    _stub git     0
    _stub wget    0
    _stub npm     0
    # id -nG for root; stub id for the root check in common.sh
    printf '#!/bin/bash\n[[ "$1" == "-u" ]] && echo 0\n' \
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
    [[ "$output" == *"Desktop username is required"* ]]
}

@test "installs vim via dnf" {
    run bash "$SCRIPT" root
    grep -q "^dnf install -y vim" "$CALLS_FILE"
}

@test "installs ShellCheck for Bash linting" {
    run bash "$SCRIPT" root
    grep -q "^dnf install -y ShellCheck" "$CALLS_FILE"
}

@test "installs pylint for Python linting" {
    run bash "$SCRIPT" root
    grep -q "^dnf install -y pylint" "$CALLS_FILE"
}
