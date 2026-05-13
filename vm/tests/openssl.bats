#!/usr/bin/env bats

# Tests for vm/tools/security/openssl.sh
#
# Run from the project root:
#   bats vm/tests/openssl.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/security/openssl.sh"

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

    _stub dnf      0
    _stub wget     0
    _stub tar      0
    _stub make     0
    _stub ldconfig 0

    # Default: OpenSSL 3.3.2 already installed at /usr/local/ssl/bin/openssl
    mkdir -p /usr/local/ssl/bin
    printf '#!/bin/bash\necho "OpenSSL 3.3.2 31 Jul 2024"\nexit 0\n' \
        > /usr/local/ssl/bin/openssl
    chmod +x /usr/local/ssl/bin/openssl

    [[ -f /root/.bash_profile ]] && cp /root/.bash_profile "$TEST_TMPDIR/bash_profile.bak"
    echo "# .bash_profile" > /root/.bash_profile
}

teardown() {
    if [[ -f "$TEST_TMPDIR/common.sh.bak" ]]; then
        mv "$TEST_TMPDIR/common.sh.bak" /tmp/common.sh
    else
        rm -f /tmp/common.sh
    fi
    if [[ -f "$TEST_TMPDIR/bash_profile.bak" ]]; then
        mv "$TEST_TMPDIR/bash_profile.bak" /root/.bash_profile
    else
        rm -f /root/.bash_profile
    fi
    rm -rf /usr/local/ssl
    rm -rf "$TEST_TMPDIR"
}

@test "exits 1 when no login-user argument is provided" {
    run bash "$SCRIPT"
    [ "$status" -eq 1 ]
    [[ "$output" == *"login user not found"* ]]
}

@test "exits 0 when OpenSSL is already installed" {
    run bash "$SCRIPT" root
    [ "$status" -eq 0 ]
}

@test "skips wget when OpenSSL is already installed" {
    run bash "$SCRIPT" root
    ! grep -q "^wget " "$CALLS_FILE"
}

@test "calls wget when OpenSSL is not installed" {
    rm -rf /usr/local/ssl   # no binary → triggers install path
    run bash "$SCRIPT" root
    grep -q "^wget " "$CALLS_FILE"
}

@test "calls dnf groupinstall for Development Tools" {
    run bash "$SCRIPT" root
    grep -q "^dnf groupinstall" "$CALLS_FILE"
}
