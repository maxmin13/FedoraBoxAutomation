#!/bin/bash

source /tmp/common.sh

if [[ 0 -eq $# ]] 
then
   echo 'ERROR: login user not found.'
   exit 1
fi

LOGIN_USER="${1}"
MVN_VERSION="3.9.5"

WORK_DIR=$(mktemp -d)
trap 'rm -rf "${WORK_DIR}"' EXIT

####
STEP "Maven"
####

wget "https://dlcdn.apache.org/maven/maven-3/${MVN_VERSION}/binaries/apache-maven-${MVN_VERSION}-bin.tar.gz" -O "${WORK_DIR}/apache-maven-${MVN_VERSION}-bin.tar.gz"

rm -rf /opt/maven
tar -xvzf "${WORK_DIR}/apache-maven-${MVN_VERSION}-bin.tar.gz" -C "${WORK_DIR}"
mv "${WORK_DIR}/apache-maven-${MVN_VERSION}" /opt/maven

if [[ ! -f /etc/profile.d/maven.sh ]]
then
{
	echo 'export M2_HOME=/opt/maven'
	echo 'export PATH=${M2_HOME}/bin:${PATH}'

} > /etc/profile.d/maven.sh

fi

source /etc/profile.d/maven.sh
mvn -version

echo "Maven successfully installed."
