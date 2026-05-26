#!/usr/bin/env bats

# Tests for vm/tools/automation/ansible.sh
#
# Run from the project root:
#   bats vm/tests/ansible.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/automation/ansible.sh"

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

    _stub dnf 0
    _stub curl 0

    # python3 stub prints a version string for the log_info line
    printf '#!/bin/bash\nif [[ "$1" == "--version" ]]; then echo "Python 3.12.0"; fi\nprintf "python3 %%s\\n" "$*" >> "%s"\nexit 0\n' \
        "$CALLS_FILE" > "$TEST_TMPDIR/bin/python3"
    chmod +x "$TEST_TMPDIR/bin/python3"

    # Default: ansible already installed
    _stub ansible 0
}

teardown() {
    if [[ -f "$TEST_TMPDIR/common.sh.bak" ]]; then
        mv "$TEST_TMPDIR/common.sh.bak" /tmp/common.sh
    else
        rm -f /tmp/common.sh
    fi
    rm -rf "$TEST_TMPDIR"
}

@test "exits 2 when Python 3 is not installed" {
    rm "$TEST_TMPDIR/bin/python3"
    run bash "$SCRIPT"
    [ "$status" -eq 2 ]
    [[ "$output" == *"Python 3 is required"* ]]
    [[ "$output" == *"python.sh"* ]]
}

@test "warns but continues when Fedora mirrors are unreachable" {
    _stub curl 1
    run bash "$SCRIPT"
    [ "$status" -eq 0 ]
    [[ "$output" == *"unreachable"* ]]
}

@test "exits 0 when Ansible is already installed" {
    run bash "$SCRIPT"
    [ "$status" -eq 0 ]
}

@test "skips dnf when Ansible is already installed" {
    run bash "$SCRIPT"
    ! grep -q "^dnf " "$CALLS_FILE"
}

@test "installs Ansible via dnf when not present" {
    rm "$TEST_TMPDIR/bin/ansible"   # remove from PATH so command -v fails
    run bash "$SCRIPT"
    grep -q "^dnf install -y ansible" "$CALLS_FILE"
}
