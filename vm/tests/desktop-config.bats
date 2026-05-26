#!/usr/bin/env bats

# Tests for vm/setup/desktop-config.sh
#
# Run from the project root:
#   bats vm/tests/desktop-config.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/setup/desktop-config.sh"

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

    _stub dnf        0
    _stub sudo       0
    _stub git        0
    _stub systemctl  0
    _stub chown      0
    _stub chmod      0

    # id -u <user> must return a UID number so gsettings_set/get can build DBUS path
    cat > "$TEST_TMPDIR/bin/id" << 'IDSTUB'
#!/bin/bash
printf "id %s\n" "$*" >> "PLACEHOLDER"
echo "0"
exit 0
IDSTUB
    sed -i "s|PLACEHOLDER|${CALLS_FILE}|g" "$TEST_TMPDIR/bin/id"
    chmod +x "$TEST_TMPDIR/bin/id"

    # Create /etc/gdm/custom.conf with the Wayland comment line that sed will enable
    [[ -f /etc/gdm/custom.conf ]] && cp /etc/gdm/custom.conf "$TEST_TMPDIR/gdm.conf.bak"
    mkdir -p /etc/gdm
    cat > /etc/gdm/custom.conf << 'GDMCONF'
[daemon]
#WaylandEnable=false
GDMCONF

    # Ensure sysctl-reload.service already exists so that section is skipped
    mkdir -p /etc/systemd/system
    [[ -f /etc/systemd/system/sysctl-reload.service ]] && \
        cp /etc/systemd/system/sysctl-reload.service "$TEST_TMPDIR/sysctl-reload.bak"
    touch /etc/systemd/system/sysctl-reload.service

    [[ -f /etc/sysctl.conf ]] && cp /etc/sysctl.conf "$TEST_TMPDIR/sysctl.conf.bak"
    touch /etc/sysctl.conf

    [[ -f /root/.bash_profile ]] && cp /root/.bash_profile "$TEST_TMPDIR/bash_profile.bak"
    echo "# .bash_profile" > /root/.bash_profile

    # Bookmarks file for the root user (HOME_DIR=/root when login-user is root)
    [[ -f /root/.config/gtk-3.0/bookmarks ]] && \
        cp /root/.config/gtk-3.0/bookmarks "$TEST_TMPDIR/bookmarks.bak"
    rm -f /root/.config/gtk-3.0/bookmarks
}

teardown() {
    if [[ -f "$TEST_TMPDIR/common.sh.bak" ]]; then
        mv "$TEST_TMPDIR/common.sh.bak" /tmp/common.sh
    else
        rm -f /tmp/common.sh
    fi
    if [[ -f "$TEST_TMPDIR/gdm.conf.bak" ]]; then
        mv "$TEST_TMPDIR/gdm.conf.bak" /etc/gdm/custom.conf
    else
        rm -f /etc/gdm/custom.conf
    fi
    if [[ -f "$TEST_TMPDIR/sysctl-reload.bak" ]]; then
        mv "$TEST_TMPDIR/sysctl-reload.bak" /etc/systemd/system/sysctl-reload.service
    else
        rm -f /etc/systemd/system/sysctl-reload.service
    fi
    if [[ -f "$TEST_TMPDIR/sysctl.conf.bak" ]]; then
        mv "$TEST_TMPDIR/sysctl.conf.bak" /etc/sysctl.conf
    else
        rm -f /etc/sysctl.conf
    fi
    if [[ -f "$TEST_TMPDIR/bash_profile.bak" ]]; then
        mv "$TEST_TMPDIR/bash_profile.bak" /root/.bash_profile
    else
        rm -f /root/.bash_profile
    fi
    if [[ -f "$TEST_TMPDIR/bookmarks.bak" ]]; then
        mv "$TEST_TMPDIR/bookmarks.bak" /root/.config/gtk-3.0/bookmarks
    else
        rm -f /root/.config/gtk-3.0/bookmarks
    fi
    rm -rf "$TEST_TMPDIR"
}

@test "exits 1 when no login-user argument is provided" {
    run bash "$SCRIPT"
    [ "$status" -eq 1 ]
    [[ "$output" == *"Desktop username is required"* ]]
}

@test "exits 0 with all tools stubbed" {
    run bash "$SCRIPT" root
    [ "$status" -eq 0 ]
}

@test "installs dbus-x11 dependency via dnf" {
    run bash "$SCRIPT" root
    grep -q "^dnf install -y dbus-x11" "$CALLS_FILE"
}

@test "disables Wayland by editing gdm configuration" {
    run bash "$SCRIPT" root
    grep -q 'WaylandEnable=false' /etc/gdm/custom.conf
}

@test "configures git to use LF line endings" {
    run bash "$SCRIPT" root
    grep -q "core.autocrlf" "$CALLS_FILE"
}

@test "adds /opt bookmark to Nautilus when not present" {
    run bash "$SCRIPT" root
    grep -q 'file:///opt' /root/.config/gtk-3.0/bookmarks
}

@test "does not duplicate /opt bookmark when already present" {
    mkdir -p /root/.config/gtk-3.0
    echo 'file:///opt opt' > /root/.config/gtk-3.0/bookmarks
    run bash "$SCRIPT" root
    [ "$(grep -c 'file:///opt' /root/.config/gtk-3.0/bookmarks)" -eq 1 ]
}
