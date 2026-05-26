#!/usr/bin/env bats

# Tests for vm/setup/system-prep.sh
#
# Run from the project root:
#   bats vm/tests/system-prep.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/setup/system-prep.sh"

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

    _stub dnf       0
    _stub systemctl 0
    _stub uname     0

    # rpm: handles -E %fedora (version query) and -q (package check)
    cat > "$TEST_TMPDIR/bin/rpm" << RPMSTUB
#!/bin/bash
printf "rpm %s\n" "\$*" >> "${CALLS_FILE}"
[[ "\$1" == "-E" ]] && echo "44" && exit 0
exit 0
RPMSTUB
    chmod +x "$TEST_TMPDIR/bin/rpm"

    # nmcli: virbr0 connection/device not found by default (exit 1)
    cat > "$TEST_TMPDIR/bin/nmcli" << NMCLISTUB
#!/bin/bash
printf "nmcli %s\n" "\$*" >> "${CALLS_FILE}"
exit 1
NMCLISTUB
    chmod +x "$TEST_TMPDIR/bin/nmcli"

    # systemctl is-active libvirtd: not active by default
    # (the _stub above exits 0 for all systemctl calls, which means
    #  is-active returns true; override for the libvirtd test below)
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

@test "removes libreoffice and firefox" {
    run bash "$SCRIPT" root
    grep -q "^dnf remove -y libreoffice\* firefox" "$CALLS_FILE"
}

@test "skips nmcli virbr0 delete when the connection does not exist" {
    run bash "$SCRIPT" root
    ! grep -q "^nmcli connection delete virbr0" "$CALLS_FILE"
}

@test "deletes the virbr0 connection when it exists" {
    # Make nmcli connection show virbr0 succeed (exit 0)
    cat > "$TEST_TMPDIR/bin/nmcli" << NMCLISTUB
#!/bin/bash
printf "nmcli %s\n" "\$*" >> "${CALLS_FILE}"
exit 0
NMCLISTUB
    chmod +x "$TEST_TMPDIR/bin/nmcli"
    run bash "$SCRIPT" root
    grep -q "^nmcli connection delete virbr0" "$CALLS_FILE"
}

@test "installs RPM Fusion free repo when not present" {
    _stub rpm 1   # all rpm -q checks fail = packages not present
    # Override rpm to still handle -E for Fedora version
    cat > "$TEST_TMPDIR/bin/rpm" << RPMSTUB
#!/bin/bash
printf "rpm %s\n" "\$*" >> "${CALLS_FILE}"
[[ "\$1" == "-E" ]] && echo "44" && exit 0
exit 1
RPMSTUB
    chmod +x "$TEST_TMPDIR/bin/rpm"
    run bash "$SCRIPT" root
    grep -q "rpmfusion-free-release" "$CALLS_FILE"
}
