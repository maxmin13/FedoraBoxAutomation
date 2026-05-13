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

if [[ 0 -eq $# ]]
then
    log_error 'login user not found.'
    exit 1
fi

LOGIN_USER="${1}"
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

   wget "https://download.oracle.com/java/${LATEST_MAJOR}/latest/jdk-${LATEST_MAJOR}_linux-x64_bin.rpm" \
     -O "${WORK_DIR}/jdk.rpm"
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
   JAVA_HOME_VAL="$(readlink -f /usr/bin/java | sed 's:/bin/java::')"
   printf "\nexport JAVA_HOME=%s\n" "${JAVA_HOME_VAL}" >> "${BASH_PROFILE}"
   log_info "JAVA_HOME set to ${JAVA_HOME_VAL} in ${BASH_PROFILE}"
else
   log_info 'JAVA_HOME already in .bash_profile.'
fi
