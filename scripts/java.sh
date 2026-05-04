#!/bin/bash

source /tmp/common.sh

###################
# Provision Oracle JDK (latest)
###################

LOGIN_USER="${1:-root}"

if [[ "${LOGIN_USER}" == "root" ]]; then
    DETECTED=$(loginctl list-users --no-legend | awk '{print $2}' | grep -v root | head -1)
    if [[ -n "${DETECTED}" ]]; then
        echo "Auto-detected login user: ${DETECTED}"
        LOGIN_USER="${DETECTED}"
    else
        echo 'ERROR: Could not detect a non-root logged-in user.'
        exit 1
    fi
fi

####
STEP "Java"
####

if java --version > /dev/null 2>&1
then
   echo "Java already installed: $(java --version 2>&1 | head -1)"
else
   echo 'Installing Oracle JDK (latest) ...'

   WORK_DIR=$(mktemp -d)
   trap 'rm -rf "${WORK_DIR}"' EXIT

   LATEST_MAJOR=$(curl -s 'https://api.foojay.io/disco/v3.0/major_versions?ea=false&ga=true' \
     | python3 -c "import sys,json; versions=json.load(sys.stdin)['result']; print(max(v['major_version'] for v in versions))")

   if [[ -z "${LATEST_MAJOR}" ]]; then
      echo 'ERROR: Could not determine latest JDK version from Foojay API.'
      exit 1
   fi

   echo "Latest Oracle JDK major version: ${LATEST_MAJOR}"

   wget "https://download.oracle.com/java/${LATEST_MAJOR}/latest/jdk-${LATEST_MAJOR}_linux-x64_bin.rpm" \
     -O "${WORK_DIR}/jdk.rpm"
   rpm -Uvh "${WORK_DIR}/jdk.rpm"

   java -version
   alternatives --display java

   echo 'Oracle JDK successfully installed.'
fi

BASH_PROFILE="/home/${LOGIN_USER}/.bash_profile"
if ! grep -q 'JAVA_HOME' "${BASH_PROFILE}"; then
   JAVA_HOME_VAL="$(readlink -f /usr/bin/java | sed 's:/bin/java::')"
   printf "\nexport JAVA_HOME=%s\n" "${JAVA_HOME_VAL}" >> "${BASH_PROFILE}"
   echo "JAVA_HOME set to ${JAVA_HOME_VAL} in ${BASH_PROFILE}"
else
   echo 'JAVA_HOME already in .bash_profile.'
fi
