#!/usr/bin/env bats

# Tests for vm/setup/guest-additions.sh
#
# Run from the project root:
#   bats vm/tests/guest-additions.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/setup/guest-additions.sh"

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

    _stub dnf    0
    _stub umount 0
    _stub uname  0

    # mount: succeeds for any device by default
    cat > "$TEST_TMPDIR/bin/mount" << 'MOUNTSTUB'
#!/bin/bash
printf "mount %s\n" "$*" >> "PLACEHOLDER"
exit 0
MOUNTSTUB
    sed -i "s|PLACEHOLDER|${CALLS_FILE}|g" "$TEST_TMPDIR/bin/mount"
    chmod +x "$TEST_TMPDIR/bin/mount"

    # VBoxLinuxAdditions.run at the real mount path; succeeds by default
    mkdir -p /mnt/ga
    cat > /mnt/ga/VBoxLinuxAdditions.run << 'GASTUB'
#!/bin/bash
printf "VBoxLinuxAdditions.run %s\n" "$*" >> "PLACEHOLDER"
exit 0
GASTUB
    sed -i "s|PLACEHOLDER|${CALLS_FILE}|g" /mnt/ga/VBoxLinuxAdditions.run
    chmod +x /mnt/ga/VBoxLinuxAdditions.run
}

teardown() {
    if [[ -f "$TEST_TMPDIR/common.sh.bak" ]]; then
        mv "$TEST_TMPDIR/common.sh.bak" /tmp/common.sh
    else
        rm -f /tmp/common.sh
    fi
    rm -f /mnt/ga/VBoxLinuxAdditions.run
    rmdir /mnt/ga 2>/dev/null || true
    rm -rf "$TEST_TMPDIR"
}

@test "exits 0 when all tools succeed" {
    run bash "$SCRIPT"
    [ "$status" -eq 0 ]
}

@test "installs kernel-devel and build tools via dnf" {
    run bash "$SCRIPT"
    grep -q "^dnf install -y dkms kernel-devel-" "$CALLS_FILE"
}

@test "mounts an optical device" {
    run bash "$SCRIPT"
    grep -q "^mount " "$CALLS_FILE"
}

@test "prefers /dev/sr1 over /dev/sr0" {
    run bash "$SCRIPT"
    grep -q "^mount /dev/sr1 /mnt/ga" "$CALLS_FILE"
}

@test "falls back to /dev/sr0 when /dev/sr1 fails to mount" {
    cat > "$TEST_TMPDIR/bin/mount" << 'MOUNTSTUB'
#!/bin/bash
printf "mount %s\n" "$*" >> "PLACEHOLDER"
[[ "$1" == "/dev/sr1" ]] && exit 1
exit 0
MOUNTSTUB
    sed -i "s|PLACEHOLDER|${CALLS_FILE}|g" "$TEST_TMPDIR/bin/mount"
    chmod +x "$TEST_TMPDIR/bin/mount"
    run bash "$SCRIPT"
    [ "$status" -eq 0 ]
    grep -q "^mount /dev/sr0 /mnt/ga" "$CALLS_FILE"
}

@test "exits 1 when neither optical device can be mounted" {
    _stub mount 1
    run bash "$SCRIPT"
    [ "$status" -eq 1 ]
}

@test "runs VBoxLinuxAdditions.run" {
    run bash "$SCRIPT"
    grep -q "^VBoxLinuxAdditions.run" "$CALLS_FILE"
}

@test "exits 0 when VBoxLinuxAdditions.run exits 2 (already installed)" {
    printf '#!/bin/bash\nexit 2\n' > /mnt/ga/VBoxLinuxAdditions.run
    chmod +x /mnt/ga/VBoxLinuxAdditions.run
    run bash "$SCRIPT"
    [ "$status" -eq 0 ]
}

@test "exits non-zero when VBoxLinuxAdditions.run fails" {
    printf '#!/bin/bash\nexit 1\n' > /mnt/ga/VBoxLinuxAdditions.run
    chmod +x /mnt/ga/VBoxLinuxAdditions.run
    run bash "$SCRIPT"
    [ "$status" -ne 0 ]
}
