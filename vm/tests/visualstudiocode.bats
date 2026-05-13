#!/usr/bin/env bats

# Tests for vm/tools/ides/visualstudiocode.sh
#
# Run from the project root:
#   bats vm/tests/visualstudiocode.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/ides/visualstudiocode.sh"

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

    # Default: VS Code already installed
    _stub rpm 0
    _stub dnf 0

    # The install path writes a repo file; ensure the directory exists
    mkdir -p /etc/yum.repos.d
    VSCODE_REPO_BAK=''
    [[ -f /etc/yum.repos.d/vscode.repo ]] && \
        cp /etc/yum.repos.d/vscode.repo "$TEST_TMPDIR/vscode.repo.bak" && \
        VSCODE_REPO_BAK="$TEST_TMPDIR/vscode.repo.bak"
    export VSCODE_REPO_BAK
}

teardown() {
    if [[ -f "$TEST_TMPDIR/common.sh.bak" ]]; then
        mv "$TEST_TMPDIR/common.sh.bak" /tmp/common.sh
    else
        rm -f /tmp/common.sh
    fi
    if [[ -n "${VSCODE_REPO_BAK:-}" && -f "$VSCODE_REPO_BAK" ]]; then
        mv "$VSCODE_REPO_BAK" /etc/yum.repos.d/vscode.repo
    else
        rm -f /etc/yum.repos.d/vscode.repo
    fi
    rm -rf "$TEST_TMPDIR"
}

@test "exits 0 when VS Code is already installed" {
    run bash "$SCRIPT"
    [ "$status" -eq 0 ]
}

@test "skips dnf install when VS Code is already installed" {
    run bash "$SCRIPT"
    ! grep -q "^dnf install" "$CALLS_FILE"
}

@test "installs VS Code when not present" {
    # -q (package query) must fail; --import must succeed
    cat > "$TEST_TMPDIR/bin/rpm" << 'RPMSTUB'
#!/bin/bash
printf "rpm %s\n" "$*" >> "PLACEHOLDER"
[[ "$1" == "-q" ]] && exit 1
exit 0
RPMSTUB
    sed -i "s|PLACEHOLDER|${CALLS_FILE}|g" "$TEST_TMPDIR/bin/rpm"
    chmod +x "$TEST_TMPDIR/bin/rpm"
    run bash "$SCRIPT"
    grep -q "^dnf install -y code" "$CALLS_FILE"
}

@test "imports the Microsoft GPG key before installing" {
    cat > "$TEST_TMPDIR/bin/rpm" << 'RPMSTUB'
#!/bin/bash
printf "rpm %s\n" "$*" >> "PLACEHOLDER"
[[ "$1" == "-q" ]] && exit 1
exit 0
RPMSTUB
    sed -i "s|PLACEHOLDER|${CALLS_FILE}|g" "$TEST_TMPDIR/bin/rpm"
    chmod +x "$TEST_TMPDIR/bin/rpm"
    run bash "$SCRIPT"
    grep -q "^rpm --import" "$CALLS_FILE"
}
