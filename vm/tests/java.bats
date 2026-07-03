#!/usr/bin/env bats

# Tests for vm/tools/languages/java.sh
#
# Run from the project root:
#   bats vm/tests/java.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/languages/java.sh"

_stub() {
    local name="$1" exit_code="${2:-0}"
    printf '#!/bin/bash\nprintf "%%s %%s\\n" "%s" "$*" >> "%s"\nexit %d\n' \
        "$name" "$CALLS_FILE" "$exit_code" > "$TEST_TMPDIR/bin/$name"
    chmod +x "$TEST_TMPDIR/bin/$name"
}

# Writes a fake `java` on PATH that reports the given version for `-version`.
_stub_java_version() {
    local version="$1"
    cat > "$TEST_TMPDIR/bin/java" << JAVASTUB
#!/bin/bash
printf "java %s\n" "\$*" >> "${CALLS_FILE}"
echo 'openjdk version "${version}" 2024-01-01'
exit 0
JAVASTUB
    chmod +x "$TEST_TMPDIR/bin/java"
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

    _stub wget 0

    # Default: no RPM is installed (rpm -q fails for everything) so tests
    # that don't care about the "already installed" branch get the install path.
    _stub rpm 1
    _stub dnf 0

    # alternatives: no existing registration by default ("--query java" finds
    # nothing), matching a first-run box — the script then falls back to the
    # compgen filesystem glob to locate JAVA_BIN. --install/--set just log.
    _stub alternatives 0

    # Default java: not installed (not found on PATH at all).
    # Individual tests override with _stub_java_version as needed.

    [[ -f /root/.bash_profile ]] && cp /root/.bash_profile "$TEST_TMPDIR/bash_profile.bak"
    touch /root/.bash_profile
    [[ -f /root/.bashrc ]] && cp /root/.bashrc "$TEST_TMPDIR/bashrc.bak"
    touch /root/.bashrc

    rm -rf /usr/java /usr/lib/jvm/temurin-* /etc/yum.repos.d/adoptium.repo /etc/profile.d/jdk.sh
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
    if [[ -f "$TEST_TMPDIR/bashrc.bak" ]]; then
        mv "$TEST_TMPDIR/bashrc.bak" /root/.bashrc
    else
        rm -f /root/.bashrc
    fi
    rm -rf /usr/java /usr/lib/jvm/temurin-* /etc/yum.repos.d/adoptium.repo /etc/profile.d/jdk.sh
    rm -rf "$TEST_TMPDIR"
}

@test "exits 1 when no login-user argument is provided" {
    run bash "$SCRIPT"
    [ "$status" -eq 1 ]
    [[ "$output" == *"Desktop username is required"* ]]
}

@test "exits 0 when the requested Oracle JDK is already installed and active" {
    cat > "$TEST_TMPDIR/bin/rpm" << 'RPMSTUB'
#!/bin/bash
printf "rpm %s\n" "$*" >> "PLACEHOLDER"
[[ "$*" == *"jdk-21"* ]] && exit 0
exit 1
RPMSTUB
    sed -i "s|PLACEHOLDER|${CALLS_FILE}|g" "$TEST_TMPDIR/bin/rpm"
    chmod +x "$TEST_TMPDIR/bin/rpm"
    _stub_java_version "21.0.1"

    run bash "$SCRIPT" root 21
    [ "$status" -eq 0 ]
    [[ "$output" == *"already installed and already the active version"* ]]
    ! grep -q "^wget " "$CALLS_FILE"
}

@test "downloads and installs Oracle JDK for major version 21+" {
    mkdir -p /usr/java/jdk-21.0.1/bin
    printf '#!/bin/bash\necho ok\n' > /usr/java/jdk-21.0.1/bin/java
    chmod +x /usr/java/jdk-21.0.1/bin/java

    run bash "$SCRIPT" root 21
    [ "$status" -eq 0 ]
    grep -q "^wget " "$CALLS_FILE"
    grep -q "^dnf install" "$CALLS_FILE"
}

@test "uses Eclipse Temurin for versions below 21" {
    mkdir -p /usr/lib/jvm/temurin-17-jdk/bin
    printf '#!/bin/bash\necho ok\n' > /usr/lib/jvm/temurin-17-jdk/bin/java
    chmod +x /usr/lib/jvm/temurin-17-jdk/bin/java

    run bash "$SCRIPT" root 17
    [ "$status" -eq 0 ]
    [[ "$output" == *"Eclipse Temurin"* ]]
    grep -q "^dnf install -y temurin-17-jdk" "$CALLS_FILE"
    ! grep -q "^wget " "$CALLS_FILE"
}

@test "adds the Adoptium repo before installing Temurin when missing" {
    mkdir -p /usr/lib/jvm/temurin-17-jdk/bin
    printf '#!/bin/bash\necho ok\n' > /usr/lib/jvm/temurin-17-jdk/bin/java
    chmod +x /usr/lib/jvm/temurin-17-jdk/bin/java

    run bash "$SCRIPT" root 17
    [ "$status" -eq 0 ]
    [ -f /etc/yum.repos.d/adoptium.repo ]
}

@test "resolves the latest GA major version via the Foojay API when none is given" {
    cat > "$TEST_TMPDIR/bin/curl" << CURLSTUB
#!/bin/bash
printf "curl %s\n" "\$*" >> "${CALLS_FILE}"
echo '{"result":[{"major_version":17},{"major_version":21}]}'
exit 0
CURLSTUB
    chmod +x "$TEST_TMPDIR/bin/curl"

    mkdir -p /usr/java/jdk-21.0.1/bin
    printf '#!/bin/bash\necho ok\n' > /usr/java/jdk-21.0.1/bin/java
    chmod +x /usr/java/jdk-21.0.1/bin/java

    run bash "$SCRIPT" root
    [ "$status" -eq 0 ]
    [[ "$output" == *"Latest GA JDK major version: 21"* ]]
}

@test "exits 1 when the Foojay API returns no usable version" {
    cat > "$TEST_TMPDIR/bin/curl" << CURLSTUB
#!/bin/bash
printf "curl %s\n" "\$*" >> "${CALLS_FILE}"
exit 0
CURLSTUB
    chmod +x "$TEST_TMPDIR/bin/curl"

    run bash "$SCRIPT" root
    [ "$status" -eq 1 ]
    [[ "$output" == *"Could not determine latest JDK version"* ]]
}

@test "writes JAVA_HOME to the login user's ~/.bash_profile and ~/.bashrc after a successful install" {
    mkdir -p /usr/java/jdk-21.0.1/bin
    printf '#!/bin/bash\necho ok\n' > /usr/java/jdk-21.0.1/bin/java
    chmod +x /usr/java/jdk-21.0.1/bin/java

    run bash "$SCRIPT" root 21
    [ "$status" -eq 0 ]
    grep -q "JAVA_HOME=/usr/java/jdk-21.0.1" /root/.bash_profile
    grep -q "JAVA_HOME=/usr/java/jdk-21.0.1" /root/.bashrc
}

@test "replaces the previous JAVA_HOME line instead of duplicating it when switching versions" {
    for f in /root/.bash_profile /root/.bashrc; do
        echo 'export JAVA_HOME=/usr/java/jdk-17.0.9' >> "$f"
        echo 'export PATH="${JAVA_HOME}/bin:${PATH}"' >> "$f"
    done

    mkdir -p /usr/java/jdk-21.0.1/bin
    printf '#!/bin/bash\necho ok\n' > /usr/java/jdk-21.0.1/bin/java
    chmod +x /usr/java/jdk-21.0.1/bin/java

    run bash "$SCRIPT" root 21
    [ "$status" -eq 0 ]
    for f in /root/.bash_profile /root/.bashrc; do
        [ "$(grep -c '^export JAVA_HOME=' "$f")" -eq 1 ]
        grep -q "JAVA_HOME=/usr/java/jdk-21.0.1" "$f"
        ! grep -q "jdk-17.0.9" "$f"
    done
}

@test "removes a leftover /etc/profile.d/jdk.sh from an older script version" {
    mkdir -p /etc/profile.d
    echo 'export JAVA_HOME=/usr/java/jdk-17.0.9' > /etc/profile.d/jdk.sh

    mkdir -p /usr/java/jdk-21.0.1/bin
    printf '#!/bin/bash\necho ok\n' > /usr/java/jdk-21.0.1/bin/java
    chmod +x /usr/java/jdk-21.0.1/bin/java

    run bash "$SCRIPT" root 21
    [ "$status" -eq 0 ]
    [ ! -f /etc/profile.d/jdk.sh ]
}

@test "exits 1 when JAVA_HOME cannot be determined" {
    # Nothing on the filesystem matches the expected JDK glob, and
    # `alternatives --query java` (stubbed) reports nothing either.
    run bash "$SCRIPT" root 21
    [ "$status" -eq 1 ]
    [[ "$output" == *"Could not determine JAVA_HOME"* ]]
}
