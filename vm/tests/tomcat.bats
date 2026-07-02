#!/usr/bin/env bats

# Tests for vm/tools/web-servers/tomcat/tomcat.sh
#
# Run from the project root:
#   bats vm/tests/tomcat.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/web-servers/tomcat/tomcat.sh"

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

    _stub wget       0
    _stub chown      0
    _stub systemctl  0
    _stub readlink   0

    # Default: ss reports no listeners (port is free)
    _stub ss 0

    # No version arg is passed by these tests, so TOMCAT_VERSION defaults to
    # "latest-10" and tomcat.sh resolves it via curl before anything else
    # (including the Java check). Stub a fake Apache directory listing so it
    # deterministically resolves to 10.1.33, matching this file's fixed paths.
    cat > "$TEST_TMPDIR/bin/curl" << 'CURLSTUB'
#!/bin/bash
printf "curl %s\n" "$*" >> "PLACEHOLDER"
echo '<a href="v10.1.33/">v10.1.33/</a>'
exit 0
CURLSTUB
    sed -i "s|PLACEHOLDER|${CALLS_FILE}|g" "$TEST_TMPDIR/bin/curl"
    chmod +x "$TEST_TMPDIR/bin/curl"

    # tomcat.sh does `mv "/opt/apache-tomcat-${VERSION}" "${TOMCAT_DIR}"` right
    # after extracting, then sed's conf/server.xml — so the tar stub must
    # create that directory (parsed from -xf/--directory) with a realistic
    # server.xml, or everything after extraction aborts under errexit.
    cat > "$TEST_TMPDIR/bin/tar" << 'TARSTUB'
#!/bin/bash
printf "tar %s\n" "$*" >> "PLACEHOLDER"
tgz="" dir="" args=("$@")
for ((i=0; i<${#args[@]}; i++)); do
    case "${args[i]}" in
        -xf) tgz="${args[i+1]}" ;;
        --directory) dir="${args[i+1]}" ;;
    esac
done
if [[ -n "${tgz}" && -n "${dir}" ]]; then
    name="$(basename "${tgz}" .tar.gz)"
    mkdir -p "${dir}/${name}/conf" "${dir}/${name}/bin" "${dir}/${name}/logs"
    cat > "${dir}/${name}/conf/server.xml" << 'XML'
<Server port="8005" shutdown="SHUTDOWN">
  <Service name="Catalina">
    <Connector port="8080" protocol="HTTP/1.1" />
  </Service>
</Server>
XML
fi
exit 0
TARSTUB
    sed -i "s|PLACEHOLDER|${CALLS_FILE}|g" "$TEST_TMPDIR/bin/tar"
    chmod +x "$TEST_TMPDIR/bin/tar"

    # Provide a fake Java installation so the JAVA_HOME validity check passes.
    # The binary lives at $JAVA_HOME/bin/java (not on PATH) — the script only
    # needs to confirm the directory is a real JDK, not to run java itself.
    mkdir -p "$TEST_TMPDIR/java/bin"
    printf '#!/bin/bash\necho "openjdk 21"\n' > "$TEST_TMPDIR/java/bin/java"
    chmod +x "$TEST_TMPDIR/java/bin/java"
    export JAVA_HOME="$TEST_TMPDIR/java"

    # java stub on PATH: used when JAVA_HOME is unset/invalid and the script
    # falls back to 'java -XshowSettings:property -version' for detection.
    # Default: returns nothing useful → detection fails → exits 2.
    _stub java 0

    # Back up and reset the root .bash_profile so the profile-read fallback
    # starts clean for every test.
    [[ -f /root/.bash_profile ]] && cp /root/.bash_profile "$TEST_TMPDIR/bash_profile.bak"
    echo '# .bash_profile' > /root/.bash_profile
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
    rm -rf /opt/apache-tomcat-10.1.33-8080
    rm -rf /opt/tomcat-cache
    rm -f /etc/systemd/system/tomcat-10.1.33-8080.service
    rm -rf "$TEST_TMPDIR"
}

@test "exits 1 when no login-user argument is provided" {
    run bash "$SCRIPT"
    [ "$status" -eq 1 ]
    [[ "$output" == *"Desktop username is required"* ]]
}

@test "exits 2 when JAVA_HOME is not set and Java is not found" {
    unset JAVA_HOME
    # java stub returns no useful output → java.home detection yields nothing → exits 2
    run bash "$SCRIPT" root
    [ "$status" -eq 2 ]
    [[ "$output" == *"JAVA_HOME is not set"* ]]
    [[ "$output" == *"java.sh"* ]]
}

@test "warns and exits 2 when JAVA_HOME is pre-set to an invalid path" {
    export JAVA_HOME=/usr   # bad value written by a broken java.sh run
    # java stub on PATH returns nothing → re-detection also fails
    run bash "$SCRIPT" root
    [ "$status" -eq 2 ]
    [[ "$output" == *"JAVA_HOME=/usr is invalid"* ]]
    [[ "$output" == *"JAVA_HOME is not set"* ]]
}

@test "reads JAVA_HOME from login user's .bash_profile when not in environment" {
    unset JAVA_HOME
    # Simulate java.sh having written JAVA_HOME to the login user's .bash_profile
    echo "export JAVA_HOME=${TEST_TMPDIR}/java" >> /root/.bash_profile
    run bash "$SCRIPT" root
    [ "$status" -eq 0 ]
    [[ "$output" == *".bash_profile"* ]]
}

@test "exits 1 when the installation directory already exists" {
    mkdir -p /opt/apache-tomcat-10.1.33-8080
    run bash "$SCRIPT" root
    [ "$status" -eq 1 ]
    [[ "$output" == *"already installed on port"* ]]
}

@test "exits 1 when the port is already in use" {
    # ss stub returns a line containing ":8080 " — port appears occupied
    cat > "$TEST_TMPDIR/bin/ss" << 'SSSTUB'
#!/bin/bash
printf "ss %s\n" "$*" >> "PLACEHOLDER"
echo "tcp LISTEN 0 128 0.0.0.0:8080 0.0.0.0:*"
exit 0
SSSTUB
    sed -i "s|PLACEHOLDER|${CALLS_FILE}|g" "$TEST_TMPDIR/bin/ss"
    chmod +x "$TEST_TMPDIR/bin/ss"
    run bash "$SCRIPT" root
    [ "$status" -eq 1 ]
    [[ "$output" == *"Port 8080 is already in use"* ]]
}

@test "calls wget when the cached archive is not present" {
    run bash "$SCRIPT" root
    grep -q "^wget " "$CALLS_FILE"
}

@test "skips wget when the cached archive is already present" {
    mkdir -p /opt/tomcat-cache
    touch /opt/tomcat-cache/apache-tomcat-10.1.33.tar.gz
    run bash "$SCRIPT" root
    ! grep -q "^wget " "$CALLS_FILE"
}
