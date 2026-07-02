#!/usr/bin/env bats

# Tests for vm/tools/containers/k3s.sh
#
# Run from the project root:
#   bats vm/tests/k3s.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/containers/k3s.sh"

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

    _stub systemctl 0
    _stub timeout   0
    _stub chmod     0

    # k3s.sh checks the absolute path /usr/local/bin/k3s directly (not PATH),
    # so a PATH-based stub has no effect. Back up any real install and replace
    # it with a stand-in for the default "already installed" state.
    [[ -f /usr/local/bin/k3s ]] && mv /usr/local/bin/k3s "$TEST_TMPDIR/k3s.bin.bak"
    cat > /usr/local/bin/k3s << 'K3SSTUB'
#!/bin/bash
echo "k3s version v1.30.0 (abcdef1 go1.21.0)"
K3SSTUB
    chmod +x /usr/local/bin/k3s

    cat > "$TEST_TMPDIR/bin/curl" << 'CURLSTUB'
#!/bin/bash
printf "curl %s\n" "$*" >> "PLACEHOLDER"
exit 0
CURLSTUB
    sed -i "s|PLACEHOLDER|${CALLS_FILE}|g" "$TEST_TMPDIR/bin/curl"
    chmod +x "$TEST_TMPDIR/bin/curl"

    # Pre-create kubeconfig so the copy step succeeds
    mkdir -p /etc/rancher/k3s
    printf 'apiVersion: v1\nclusters: []\n' > /etc/rancher/k3s/k3s.yaml

    [[ -f /root/.bash_profile ]] && cp /root/.bash_profile "$TEST_TMPDIR/bash_profile.bak"
    echo "# .bash_profile" > /root/.bash_profile

    mkdir -p /root/.kube
    if [[ -f /root/.kube/config ]]; then
        cp /root/.kube/config "$TEST_TMPDIR/kube_config.bak"
    fi
}

teardown() {
    if [[ -f "$TEST_TMPDIR/common.sh.bak" ]]; then
        mv "$TEST_TMPDIR/common.sh.bak" /tmp/common.sh
    else
        rm -f /tmp/common.sh
    fi
    if [[ -f "$TEST_TMPDIR/k3s.bin.bak" ]]; then
        mv "$TEST_TMPDIR/k3s.bin.bak" /usr/local/bin/k3s
    else
        rm -f /usr/local/bin/k3s
    fi
    if [[ -f "$TEST_TMPDIR/bash_profile.bak" ]]; then
        mv "$TEST_TMPDIR/bash_profile.bak" /root/.bash_profile
    else
        rm -f /root/.bash_profile
    fi
    if [[ -f "$TEST_TMPDIR/kube_config.bak" ]]; then
        mv "$TEST_TMPDIR/kube_config.bak" /root/.kube/config
    else
        rm -f /root/.kube/config
    fi
    rm -rf /etc/rancher/k3s
    rm -rf "$TEST_TMPDIR"
}

@test "exits 1 when no login-user argument is provided" {
    run bash "$SCRIPT"
    [ "$status" -eq 1 ]
    [[ "$output" == *"Desktop username is required"* ]]
}

@test "exits 0 when k3s is already installed" {
    run bash "$SCRIPT" root
    [ "$status" -eq 0 ]
}

@test "skips download when k3s is already installed" {
    run bash "$SCRIPT" root
    ! grep -q "^curl " "$CALLS_FILE"
}

@test "downloads k3s install script when k3s is not present" {
    rm -f /usr/local/bin/k3s
    run bash "$SCRIPT" root
    grep -q "^curl " "$CALLS_FILE"
}

@test "copies kubeconfig to the user home directory" {
    run bash "$SCRIPT" root
    [ "$status" -eq 0 ]
    [[ -f /root/.kube/config ]]
}

@test "adds KUBECONFIG to .bash_profile when not present" {
    run bash "$SCRIPT" root
    grep -q 'KUBECONFIG' /root/.bash_profile
}

@test "skips adding KUBECONFIG when already in .bash_profile" {
    echo 'export KUBECONFIG=~/.kube/config' >> /root/.bash_profile
    run bash "$SCRIPT" root
    [ "$(grep -c 'KUBECONFIG' /root/.bash_profile)" -eq 1 ]
}
