#!/bin/bash

##
## Description: Installs the latest Oracle JDK via the Foojay API, and sets
##              JAVA_HOME in the login user's ~/.bash_profile.
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

if java --version > /dev/null 2>&1
then
   log_info "Java already installed: $(java --version 2>&1 | head -1)"
else
   log_info 'Installing Oracle JDK (latest) ...'

   WORK_DIR=$(mktemp -d)
   trap 'rm -rf "${WORK_DIR}"' EXIT

   if [[ -n "${2:-}" ]]; then
      LATEST_MAJOR="${2}"
   else
      LATEST_MAJOR=$(curl -s 'https://api.foojay.io/disco/v3.0/major_versions?ea=false&ga=true' \
        | python3 -c "import sys,json; versions=json.load(sys.stdin)['result']; print(max(v['major_version'] for v in versions))" || true)
      if [[ -z "${LATEST_MAJOR}" ]]; then
         log_error 'Could not determine latest JDK version from Foojay API.'
         exit 1
      fi
   fi

   log_info "Latest Oracle JDK major version: ${LATEST_MAJOR}"

   JDK_URL="https://download.oracle.com/java/${LATEST_MAJOR}/latest/jdk-${LATEST_MAJOR}_linux-x64_bin.rpm"
   log_info "Downloading Oracle JDK ${LATEST_MAJOR} from ${JDK_URL} ..."
   wget -q --tries=3 "${JDK_URL}" -O "${WORK_DIR}/jdk.rpm"
   dnf install -y "${WORK_DIR}/jdk.rpm"

   java -version
   alternatives --display java

   log_info 'Oracle JDK successfully installed.'
fi

log_info "Version  : java --version"
log_info "Compiler : javac --version"
log_info "JAVA_HOME: echo \$JAVA_HOME"

BASH_PROFILE="${HOME_DIR}/.bash_profile"
if ! grep -q 'JAVA_HOME' "${BASH_PROFILE}"; then
   # Ask the JVM itself — reliable across install methods (RPM, alternatives, custom).
   # Some JDK versions exit non-zero for diagnostic -X flags even on success;
   # catch that with a named warning instead of letting trap ERR fire.
   # 1. Ask the JVM itself (works when java is on PATH after alternatives setup).
   JAVA_HOME_VAL="$(java -XshowSettings:property -version 2>&1 \
       | awk -F' = ' '/[[:space:]]java\.home/{print $2; exit}')" \
       || { log_warn 'java -XshowSettings:property exited non-zero; trying filesystem search.'; true; }

   # 2. Search standard Oracle JDK / OpenJDK filesystem paths.
   #    Needed when the RPM was just installed and alternatives are not yet on PATH.
   if [[ -z "${JAVA_HOME_VAL}" || ! -x "${JAVA_HOME_VAL}/bin/java" ]]; then
      for _dir in /usr/java/jdk-* /usr/lib/jvm/java-*-oracle /usr/lib/jvm/java-*-openjdk-*; do
         if [[ -x "${_dir}/bin/java" ]]; then
            JAVA_HOME_VAL="${_dir}"
            log_warn "java not on PATH; found JDK at ${JAVA_HOME_VAL}."
            break
         fi
      done
   fi

   # 3. Follow /usr/bin/java symlink chain as a last resort.
   if [[ -z "${JAVA_HOME_VAL}" || ! -x "${JAVA_HOME_VAL}/bin/java" ]]; then
      JAVA_HOME_VAL="$(readlink -f /usr/bin/java 2>/dev/null | sed 's:/bin/java::')" \
          || { log_warn 'readlink /usr/bin/java failed.'; true; }
   fi

   if [[ -z "${JAVA_HOME_VAL}" || ! -x "${JAVA_HOME_VAL}/bin/java" ]]; then
      log_error 'Could not determine JAVA_HOME. Verify java.sh completed successfully.'
      exit 1
   fi

   printf "\nexport JAVA_HOME=%s\n" "${JAVA_HOME_VAL}" >> "${BASH_PROFILE}"
   log_info "JAVA_HOME set to ${JAVA_HOME_VAL} in ${BASH_PROFILE}"
else
   log_info 'JAVA_HOME already in .bash_profile.'
fi
