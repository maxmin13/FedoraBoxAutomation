#!/usr/bin/env bats

# Tests for vm/tools/languages/python.sh
#
# Run from the project root:
#   bats vm/tests/python.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/languages/python.sh"

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

    _stub dnf   0
    _stub wget  0
    _stub tar   0
    _stub make  0
    _stub chown 0
    _stub git   0

    # Default: python3.13 already installed — reports matching version
    cat > "$TEST_TMPDIR/bin/python3.13" << 'PYSTUB'
#!/bin/bash
printf "python3.13 %s\n" "$*" >> "PLACEHOLDER"
echo "Python 3.13.3"
exit 0
PYSTUB
    sed -i "s|PLACEHOLDER|${CALLS_FILE}|g" "$TEST_TMPDIR/bin/python3.13"
    chmod +x "$TEST_TMPDIR/bin/python3.13"

    # Default curl returns a version JSON line that parses to 3.13.3
    cat > "$TEST_TMPDIR/bin/curl" << 'CURLSTUB'
#!/bin/bash
printf "curl %s\n" "$*" >> "PLACEHOLDER"
echo '"latest":"3.13.3"'
exit 0
CURLSTUB
    sed -i "s|PLACEHOLDER|${CALLS_FILE}|g" "$TEST_TMPDIR/bin/curl"
    chmod +x "$TEST_TMPDIR/bin/curl"

    # Pre-create venv and pyenv dirs so those sections are skipped
    mkdir -p /root/python_venv_3.13
    mkdir -p /root/.pyenv

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
    rm -rf /root/python_venv_3.13
    rm -rf /root/.pyenv
    rm -rf "$TEST_TMPDIR"
}

@test "exits 1 when no login-user argument is provided" {
    run bash "$SCRIPT"
    [ "$status" -eq 1 ]
    [[ "$output" == *"login user not found"* ]]
}

@test "exits 1 when the version API returns an empty version" {
    # curl returns '"latest":""' so after sed stripping the version is empty
    cat > "$TEST_TMPDIR/bin/curl" << 'CURLSTUB'
#!/bin/bash
printf "curl %s\n" "$*" >> "PLACEHOLDER"
echo '"latest":""'
exit 0
CURLSTUB
    sed -i "s|PLACEHOLDER|${CALLS_FILE}|g" "$TEST_TMPDIR/bin/curl"
    chmod +x "$TEST_TMPDIR/bin/curl"
    run bash "$SCRIPT" root
    [ "$status" -eq 1 ]
    [[ "$output" == *"Could not determine latest Python version"* ]]
}

@test "exits 0 when Python is already installed" {
    run bash "$SCRIPT" root 3.13.3
    [ "$status" -eq 0 ]
}

@test "skips wget when Python is already installed" {
    run bash "$SCRIPT" root 3.13.3
    ! grep -q "^wget " "$CALLS_FILE"
}

@test "calls wget when Python is not installed" {
    _stub python3.13 1   # -V returns exit 1 → version not matched → build path
    run bash "$SCRIPT" root 3.13.3
    grep -q "^wget " "$CALLS_FILE"
}

@test "adds PYENV_ROOT to .bash_profile when not present" {
    run bash "$SCRIPT" root 3.13.3
    grep -q 'PYENV_ROOT' /root/.bash_profile
}

@test "skips adding PYENV_ROOT when already in .bash_profile" {
    echo 'export PYENV_ROOT="$HOME/.pyenv"' >> /root/.bash_profile
    run bash "$SCRIPT" root 3.13.3
    [ "$(grep -c 'PYENV_ROOT' /root/.bash_profile)" -eq 1 ]
}
