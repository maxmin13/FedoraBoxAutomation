#!/bin/bash

set -o errexit
set -o pipefail
set -o nounset
set +o xtrace

###################
# Provision jdk 23
###################

STEP() { echo ; echo ; echo "==\\" ; echo "===>" "$@" ; echo "==/" ; echo ; }

if [[ 0 -eq $# ]] 
then
   echo 'ERROR: login user not found.'
   exit 1
fi

LOGIN_USER="${1}"

####
STEP "Java"
####

set +e
version="$(java --version)"
set -e

if [[ "${version}" =~ .*'java 23'.* ]]
then
   echo 'Java 23 alredy installed.'
else
   echo 'Install Java SE'

   cd /usr/src
   rm -rf jdk-23_linux-x64_bin.rpm
   wget https://download.oracle.com/java/23/latest/jdk-23_linux-x64_bin.rpm
   rpm -Uvh jdk-23_linux-x64_bin.rpm

   java -version
   update-alternatives --display java

   rm -rf jdk-23_linux-x64_bin.rpm
   
   printf "export JAVA_HOME=$(readlink -f /usr/bin/java | sed 's:/bin/java::')" >> /home/"${LOGIN_USER}"/.bash_profile
   
   echo 'java successfully installed.' 
fi


