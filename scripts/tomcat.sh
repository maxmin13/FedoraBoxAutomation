#!/bin/bash

set -o errexit
set -o pipefail
set -o nounset
set +o xtrace

##########################
# Provision Tomcat 10.1.33
##########################

STEP() { echo ; echo ; echo "==\\" ; echo "===>" "$@" ; echo "==/" ; echo ; }

####
STEP "Tomcat"
####

if [[ -d '/opt/apache-tomcat-10.1.33' ]]
then
	echo 'Tomcat already installed.'
else
   echo 'Install Tomcat 10.1.33'

   cd /usr/src
   wget https://dlcdn.apache.org/tomcat/tomcat-10/v10.1.33/bin/apache-tomcat-10.1.33.tar.gz -O tomcat.tar.gz
   tar -zxf tomcat.tar.gz --directory /opt

   rm -f tomcat.tar.gz

   echo
   echo 'Tomcat successfully installed.'
fi


