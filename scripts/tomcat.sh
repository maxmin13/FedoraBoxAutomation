#!/bin/bash

##
## Description: Downloads and installs Apache Tomcat 10.1.33 to /opt.
## Usage:       sudo ./tomcat.sh
##

source /tmp/common.sh

####
STEP "Tomcat"
####

if [[ -d '/opt/apache-tomcat-10.1.33' ]]
then
	echo 'Tomcat already installed.'
else
   echo 'Install Tomcat 10.1.33'

   WORK_DIR=$(mktemp -d)
   trap 'rm -rf "${WORK_DIR}"' EXIT

   wget https://dlcdn.apache.org/tomcat/tomcat-10/v10.1.33/bin/apache-tomcat-10.1.33.tar.gz -O "${WORK_DIR}/tomcat.tar.gz"
   tar -zxf "${WORK_DIR}/tomcat.tar.gz" --directory /opt

   echo
   echo 'Tomcat successfully installed.'
fi


