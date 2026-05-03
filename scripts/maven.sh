#!/bin/bash

set -o errexit
set -o pipefail
set -o nounset
set +o xtrace

STEP() { echo ; echo ; echo "==\\" ; echo "===>" "$@" ; echo "==/" ; echo ; }

if [[ 0 -eq $# ]] 
then
   echo 'ERROR: login user not found.'
   exit 1
fi

LOGIN_USER="${1}"
MVN_VERSION="3.9.5"

####
STEP "Maven"
####

cd /home/"${LOGIN_USER}"

if [[ ! -f apache-maven-"${MVN_VERSION}"-bin.tar.gz ]]
then
	wget https://dlcdn.apache.org/maven/maven-3/"${MVN_VERSION}"/binaries/apache-maven-"${MVN_VERSION}"-bin.tar.gz
fi

rm -rf apache-maven-"${MVN_VERSION}"
tar -xvzf apache-maven-"${MVN_VERSION}"-bin.tar.gz
mv apache-maven-"${MVN_VERSION}" /opt/maven
rm -f apache-maven-"${MVN_VERSION}"-bin.tar.gz

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
