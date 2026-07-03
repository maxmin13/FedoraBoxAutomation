#!/bin/bash

##
## Description: Installs a JDK alongside any existing versions and sets
##              JAVA_HOME in the login user's ~/.bash_profile and ~/.bashrc.
##              Multiple JDK versions coexist; the requested version becomes
##              the active default via the alternatives system.
##
##              Oracle JDK is used for versions 21+ (freely downloadable).
##              OpenJDK from Fedora repos is used for versions 17 and below.
##
## Usage:       sudo ./java.sh <login-user> [major-version]
## Parameters:  $1  <login-user>     Non-root desktop username (e.g. maxmin)
##              $2  [major-version]  Optional JDK major version (e.g. 21).
##                                   Defaults to the latest GA version from
##                                   the Foojay API when omitted.
##

source /tmp/common.sh

LOGIN_USER="${1:-}"
require_login_user "${LOGIN_USER}"
HOME_DIR=$(eval echo "~${LOGIN_USER}")

####
STEP "Java"
####

REQUESTED="${2:-}"

# Resolve the target major version before checking if it is already installed.
if [[ -n "${REQUESTED}" ]]; then
   TARGET_MAJOR="${REQUESTED}"
else
   log_info 'Querying Foojay API for latest GA JDK version ...'
   TARGET_MAJOR=$(curl -s 'https://api.foojay.io/disco/v3.0/major_versions?ea=false&ga=true' \
     | python3 -c "import sys,json; versions=json.load(sys.stdin)['result']; print(max(v['major_version'] for v in versions))" || true)
   if [[ -z "${TARGET_MAJOR}" ]]; then
      log_error 'Could not determine latest JDK version from Foojay API.'
      exit 1
   fi
   log_info "Latest GA JDK major version: ${TARGET_MAJOR}"
fi

# Oracle only keeps a free /latest/ download for version 21+.
# Older versions use Eclipse Temurin (Adoptium) — freely available for all LTS versions.
USE_ORACLE=false
if [[ "${TARGET_MAJOR}" -ge 21 ]]; then
   USE_ORACLE=true
   log_info "JDK ${TARGET_MAJOR}: using Oracle JDK (free download available for 21+)"
else
   log_info "JDK ${TARGET_MAJOR}: using Eclipse Temurin (Oracle does not offer a free download for versions older than 21)"
fi

ensure_adoptium_repo() {
   if [[ ! -f /etc/yum.repos.d/adoptium.repo ]]; then
      log_info 'Adding Eclipse Adoptium RPM repository ...'
      cat > /etc/yum.repos.d/adoptium.repo << 'EOF'
[Adoptium]
name=Eclipse Adoptium
baseurl=https://packages.adoptium.net/artifactory/rpm/fedora/$releasever/$basearch
enabled=1
gpgcheck=1
gpgkey=https://packages.adoptium.net/artifactory/api/gpg/key/public
EOF
   fi
}

active_java_major() {
   java -version 2>&1 \
     | awk -F'"' '/version/ { split($2, a, "."); print (a[1]=="1") ? a[2] : a[1] }' \
     || true
}

install_jdk() {
   if [[ "${USE_ORACLE}" == true ]]; then
      if rpm -q "jdk-${TARGET_MAJOR}" &>/dev/null; then
         if [[ "$(active_java_major)" == "${TARGET_MAJOR}" ]]; then
            log_info "Oracle JDK ${TARGET_MAJOR} is already installed and already the active version."
            exit 0
         fi
         log_info "Oracle JDK ${TARGET_MAJOR} is installed — making it the active version."
         return 0
      fi
      local WORK_DIR
      WORK_DIR=$(mktemp -d)
      trap 'rm -rf "${WORK_DIR}"' EXIT
      local JDK_URL="https://download.oracle.com/java/${TARGET_MAJOR}/latest/jdk-${TARGET_MAJOR}_linux-x64_bin.rpm"
      log_info "Downloading Oracle JDK ${TARGET_MAJOR} from ${JDK_URL} ..."
      wget -q --tries=3 "${JDK_URL}" -O "${WORK_DIR}/jdk.rpm"
      dnf install -y "${WORK_DIR}/jdk.rpm"
      log_info "Oracle JDK ${TARGET_MAJOR} installed."
      rm -rf "${WORK_DIR}"
      trap - EXIT
   else
      local PKG="temurin-${TARGET_MAJOR}-jdk"
      if rpm -q "${PKG}" &>/dev/null; then
         if [[ "$(active_java_major)" == "${TARGET_MAJOR}" ]]; then
            log_info "Eclipse Temurin JDK ${TARGET_MAJOR} is already installed and already the active version."
            exit 0
         fi
         log_info "Eclipse Temurin JDK ${TARGET_MAJOR} is installed — making it the active version."
         return 0
      fi
      ensure_adoptium_repo
      log_info "Installing Eclipse Temurin JDK ${TARGET_MAJOR} ..."
      dnf install -y "${PKG}"
      log_info "Eclipse Temurin JDK ${TARGET_MAJOR} installed."
   fi
}

install_jdk

# alternatives(8) lives in /usr/sbin which may not be in the guestcontrol PATH.
ALTERNATIVES=/usr/sbin/alternatives
[[ -x "${ALTERNATIVES}" ]] || ALTERNATIVES=$(command -v alternatives 2>/dev/null || true)

# Find the java binary path that was registered with alternatives by the RPM,
# rather than guessing the path ourselves (avoids version-suffix mismatches).
# Returns empty string (never fails) so the filesystem fallback can take over.
find_alt_java() {
   local pattern="$1"
   { "${ALTERNATIVES}" --query java 2>/dev/null || true; } \
     | awk '/^Alternative:/ { print $2 }' \
     | { grep "${pattern}" || true; } \
     | head -1
}

if [[ "${USE_ORACLE}" == true ]]; then
   JAVA_BIN=$(find_alt_java "/java/jdk-${TARGET_MAJOR}")
   # Filesystem fallback if alternatives query returned nothing (e.g. first run, DB not yet updated)
   [[ -z "${JAVA_BIN}" ]] && JAVA_BIN=$(compgen -G "/usr/java/jdk-${TARGET_MAJOR}*/bin/java" 2>/dev/null | sort -V | tail -1 || true)
else
   JAVA_BIN=$(find_alt_java "temurin-${TARGET_MAJOR}")
   [[ -z "${JAVA_BIN}" ]] && JAVA_BIN=$(compgen -G "/usr/lib/jvm/temurin-${TARGET_MAJOR}*/bin/java" 2>/dev/null | sort -V | tail -1 || true)
fi

JDK_HOME="${JAVA_BIN%/bin/java}"

# Make the target version the active default via alternatives.
# Oracle JDK RPMs do not always auto-register with the alternatives system,
# so we --install first (idempotent) and then --set.
if [[ -x "${JAVA_BIN}" && -n "${ALTERNATIVES}" ]]; then
   PRIORITY=$(( TARGET_MAJOR * 10000 ))
   "${ALTERNATIVES}" --install /usr/bin/java java "${JAVA_BIN}" "${PRIORITY}" 2>/dev/null || true
   JAVAC_BIN="${JDK_HOME}/bin/javac"
   if [[ -x "${JAVAC_BIN}" ]]; then
      "${ALTERNATIVES}" --install /usr/bin/javac javac "${JAVAC_BIN}" "${PRIORITY}" 2>/dev/null || true
   fi
   if "${ALTERNATIVES}" --set java "${JAVA_BIN}"; then
      log_info "Active java set to ${JAVA_BIN}"
      [[ -x "${JAVAC_BIN}" ]] && "${ALTERNATIVES}" --set javac "${JAVAC_BIN}" 2>/dev/null || true
   else
      log_warn "alternatives --set java ${JAVA_BIN} failed — java -version may still show the previous default."
   fi
else
   log_warn "Could not locate java binary for JDK ${TARGET_MAJOR} — alternatives not updated. JAVA_BIN=${JAVA_BIN}"
fi

JAVA_HOME_VAL="${JDK_HOME}"

if [[ -z "${JAVA_HOME_VAL}" || ! -x "${JAVA_HOME_VAL}/bin/java" ]]; then
   log_error 'Could not determine JAVA_HOME. Verify java.sh completed successfully.'
   exit 1
fi

# Set JAVA_HOME in both ~/.bash_profile (login shells, matching the other
# provisioning scripts: httpd.sh, k3s.sh, python.sh, openssl.sh) and
# ~/.bashrc (interactive non-login shells — most desktop terminal windows
# use these, so .bash_profile alone would only take effect after a full
# logout/login). Re-running with a different major version must replace the
# old JAVA_HOME line, not just add another one, so strip any previous export
# before appending the current one.
write_java_home() {
    local profile="$1"
    touch "${profile}"
    sed -i '/^export JAVA_HOME=/d; /^export PATH="\${JAVA_HOME}\/bin:\${PATH}"$/d' "${profile}"
    {
        echo ''
        echo '# Java JDK'
        echo "export JAVA_HOME=${JAVA_HOME_VAL}"
        echo 'export PATH="${JAVA_HOME}/bin:${PATH}"'
    } >> "${profile}"
    chown "${LOGIN_USER}:${LOGIN_USER}" "${profile}" 2>/dev/null || true
}
write_java_home "${HOME_DIR}/.bash_profile"
write_java_home "${HOME_DIR}/.bashrc"

# Remove a jdk.sh drop-in left by an older version of this script, so it
# doesn't keep exporting a stale JAVA_HOME system-wide.
rm -f /etc/profile.d/jdk.sh

log_info "JAVA_HOME added to ~/.bash_profile and ~/.bashrc — open a new terminal for the change to take effect"

export JAVA_HOME="${JAVA_HOME_VAL}"
export PATH="${JAVA_HOME}/bin:${PATH}"
hash -r 2>/dev/null || true
java -version
log_info "Java JDK ${TARGET_MAJOR} is now the active version. JAVA_HOME=${JAVA_HOME_VAL}"
