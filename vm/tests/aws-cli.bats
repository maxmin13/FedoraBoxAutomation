#!/usr/bin/env bats

# Tests for vm/tools/cloud/aws-cli.sh
#
# Run from the project root:
#   bats vm/tests/aws-cli.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/cloud/aws-cli.sh"

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

    # Point testable env vars at temp paths — not created here, so default is
    # "not installed". Individual tests mkdir the install dir when they need it.
    export FEDORA_BOX_AWS_INSTALL_DIR="$TEST_TMPDIR/aws-install"
    export FEDORA_BOX_AWS_BIN="$TEST_TMPDIR/bin/aws"

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

    _stub aws   0
    _stub dnf   0
    _stub curl  0
    _stub chown 0
    _stub mkdir 0

    # unzip stub: logs the call and creates ${WORK_DIR}/aws/install so the
    # script can proceed to run the installer. Uses the real mkdir/chmod via
    # absolute path — the PATH-stubbed `mkdir` below (for the ~/.aws test)
    # would otherwise swallow this directory creation too.
    cat > "$TEST_TMPDIR/bin/unzip" <<UNZIPSCRIPT
#!/bin/bash
printf "unzip %s\n" "\$*" >> "$CALLS_FILE"
while [[ \$# -gt 0 ]]; do
    if [[ "\$1" == "-d" ]]; then DEST="\$2"; break; fi
    shift
done
/bin/mkdir -p "\${DEST}/aws"
printf '#!/bin/bash\nprintf "aws_install %%s\\n" "\$*" >> $CALLS_FILE\nexit 0\n' > "\${DEST}/aws/install"
/bin/chmod +x "\${DEST}/aws/install"
exit 0
UNZIPSCRIPT
    chmod +x "$TEST_TMPDIR/bin/unzip"
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

@test "exits 1 and emits 'Install anyway' message when already installed without --force" {
    /bin/mkdir -p "$FEDORA_BOX_AWS_INSTALL_DIR"
    run bash "$SCRIPT" testuser
    [ "$status" -eq 1 ]
    [[ "$output" == *"Use 'Install anyway'"* ]]
}

@test "does not download when already installed without --force" {
    /bin/mkdir -p "$FEDORA_BOX_AWS_INSTALL_DIR"
    run bash "$SCRIPT" testuser
    ! grep -q "^curl " "$CALLS_FILE"
}

@test "downloads and installs when not previously installed" {
    run bash "$SCRIPT" testuser
    grep -q "^curl " "$CALLS_FILE"
    grep -q "^aws_install" "$CALLS_FILE"
}

@test "exits 0 after a fresh install" {
    run bash "$SCRIPT" testuser
    [ "$status" -eq 0 ]
}

@test "passes --update to the installer when --force and already installed" {
    /bin/mkdir -p "$FEDORA_BOX_AWS_INSTALL_DIR"
    run bash "$SCRIPT" testuser --force
    [ "$status" -eq 0 ]
    grep -q "aws_install --update" "$CALLS_FILE"
}

@test "does not pass --update when performing a fresh install" {
    run bash "$SCRIPT" testuser
    # installer is called but without --update (the call-log stub always
    # appends a trailing space before its "$*", even when args are empty)
    grep -q "^aws_install $" "$CALLS_FILE"
}

@test "creates the ~/.aws directory for the login user" {
    run bash "$SCRIPT" testuser
    grep -q "^mkdir " "$CALLS_FILE"
}
