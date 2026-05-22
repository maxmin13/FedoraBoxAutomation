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
log_error() { _log ERROR "$@"; printf 'ERROR: %s\n' "$*"; }
STEP()      { echo; _log STEP "===[ $* ]==="; echo; }
require_login_user() {
    local user="${1:-}"
    if [[ -z "$user" ]]; then
        log_error 'Desktop username is required as the first argument.'
        exit 1
    fi
}
STUB

    _stub dnf  0
    _stub wget 0
    _stub tar  0
    _stub make 0

    # rpm: default returns 1 (openssl-libs not installed) so the install path is reached
    _stub rpm 1

    # ldd: simulate correct RPATH pointing at /usr/local/ssl/lib64
    cat > "$TEST_TMPDIR/bin/ldd" << 'EOF'
#!/bin/bash
printf "\tlibssl.so.3 => /usr/local/ssl/lib64/libssl.so.3 (0x00007f0000000000)\n"
exit 0
EOF
    chmod +x "$TEST_TMPDIR/bin/ldd"

    # Default: OpenSSL 3.3.2 already installed at /usr/local/ssl
    mkdir -p /usr/local/ssl/bin
    # Smart stub: handles all subcommands used by sanity checks
    cat > /usr/local/ssl/bin/openssl << 'EOF'
#!/bin/bash
case "$1" in
    version)
        echo "OpenSSL 3.3.2 31 Jul 2024"
        ;;
    dgst)
        cat > /dev/null
        echo "(stdin)= abc123"
        ;;
    enc)
        cat > /dev/null
        # Decrypt path must output the original plaintext so the roundtrip grep passes
        if [[ "$*" == *" -d "* ]]; then echo "test"; fi
        ;;
    req)
        prev=""
        for arg in "$@"; do
            [[ "$prev" == "-out" ]] && touch "$arg"
            prev="$arg"
        done
        ;;
esac
exit 0
EOF
    chmod +x /usr/local/ssl/bin/openssl

    # Config file expected by sanity checks
    touch /usr/local/ssl/openssl.cnf

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

# ── Argument validation ────────────────────────────────────────────────────────

@test "exits 1 when no login-user argument is provided" {
    run bash "$SCRIPT"
    [ "$status" -eq 1 ]
    [[ "$output" == *"Desktop username is required"* ]]
}

# ── Already-installed path ─────────────────────────────────────────────────────

@test "exits 0 when OpenSSL 3.3.2 is already installed" {
    run bash "$SCRIPT" root
    [ "$status" -eq 0 ]
}

@test "skips wget when OpenSSL 3.3.2 is already installed" {
    run bash "$SCRIPT" root
    ! grep -q "^wget " "$CALLS_FILE"
}

# ── Different-version-at-custom-path path ──────────────────────────────────────

@test "exits 2 when a different version is installed at /usr/local/ssl and no --force" {
    printf '#!/bin/bash\necho "OpenSSL 3.4.0 01 Jan 2025"\nexit 0\n' \
        > /usr/local/ssl/bin/openssl
    chmod +x /usr/local/ssl/bin/openssl
    run bash "$SCRIPT" root
    [ "$status" -eq 2 ]
    [[ "$output" == *"Install anyway"* ]]
}

# ── System openssl-libs detection ─────────────────────────────────────────────

@test "exits 2 when openssl-libs RPM is installed and no --force" {
    rm -rf /usr/local/ssl
    # Override rpm stub: returns 0 so openssl-libs appears installed
    cat > "$TEST_TMPDIR/bin/rpm" << 'EOF'
#!/bin/bash
if [[ "$*" == *"--queryformat"* ]]; then echo "3.5.5"; fi
exit 0
EOF
    chmod +x "$TEST_TMPDIR/bin/rpm"
    run bash "$SCRIPT" root
    [ "$status" -eq 2 ]
    [[ "$output" == *"Install anyway"* ]]
}

@test "proceeds past the RPM check when --force is given" {
    rm -rf /usr/local/ssl
    cat > "$TEST_TMPDIR/bin/rpm" << 'EOF'
#!/bin/bash
if [[ "$*" == *"--queryformat"* ]]; then echo "3.5.5"; fi
exit 0
EOF
    chmod +x "$TEST_TMPDIR/bin/rpm"
    run bash "$SCRIPT" root --force
    grep -q "^wget " "$CALLS_FILE"
}

# ── Fresh-install path ─────────────────────────────────────────────────────────

@test "calls dnf install when OpenSSL is not installed" {
    rm -rf /usr/local/ssl
    run bash "$SCRIPT" root
    grep -q "^dnf " "$CALLS_FILE"
}

@test "calls wget when OpenSSL is not installed" {
    rm -rf /usr/local/ssl
    run bash "$SCRIPT" root
    grep -q "^wget " "$CALLS_FILE"
}

@test "appends /usr/local/ssl/bin to .bash_profile after install" {
    rm -rf /usr/local/ssl

    # Minimal stubs so the install branch reaches the PATH-append step
    cat > "$TEST_TMPDIR/bin/tar" << EOF
#!/bin/bash
mkdir -p "$TEST_TMPDIR/openssl-src/openssl-3.3.2"
exit 0
EOF
    chmod +x "$TEST_TMPDIR/bin/tar"

    cat > "$TEST_TMPDIR/bin/mktemp" << EOF
#!/bin/bash
echo "$TEST_TMPDIR/openssl-src"
EOF
    chmod +x "$TEST_TMPDIR/bin/mktemp"

    # ./config and make install are relative-path calls; stub them via a fake
    # openssl-3.3.2 dir placed in the work dir
    mkdir -p "$TEST_TMPDIR/openssl-src/openssl-3.3.2"
    cat > "$TEST_TMPDIR/openssl-src/openssl-3.3.2/config" << 'EOF'
#!/bin/bash
exit 0
EOF
    chmod +x "$TEST_TMPDIR/openssl-src/openssl-3.3.2/config"

    run bash "$SCRIPT" root
    grep -q "usr/local/ssl/bin" /root/.bash_profile
}

@test "does not duplicate PATH entry when already present in .bash_profile" {
    echo 'PATH=${PATH}:/usr/local/ssl/bin' >> /root/.bash_profile
    echo 'export PATH'                     >> /root/.bash_profile
    run bash "$SCRIPT" root
    count=$(grep -c "usr/local/ssl/bin" /root/.bash_profile)
    [ "$count" -eq 1 ]
}
