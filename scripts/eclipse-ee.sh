#!/bin/bash

##
## Description: Downloads the Eclipse Enterprise Edition installer (latest
##              release) to /opt/eclipse-installer. Run the installer manually
##              after download to select the desired Eclipse flavour.
## Usage:       sudo ./eclipse-ee.sh
##

source /tmp/common.sh

####
STEP "Eclipse Enterprise"
####


if [[ -d '/opt/eclipse-installer' ]]
then
	echo 'Eclipse enterprise already downloaded.'
else
  WORK_DIR=$(mktemp -d)
  trap 'rm -rf "${WORK_DIR}"' EXIT

  ECLIPSE_VERSION=$(curl -sL https://api.github.com/repos/eclipse-packaging/packages/releases/latest | grep -oP '"tag_name":\s*"\K[^"]+')
  wget "https://www.eclipse.org/downloads/download.php?file=/oomph/epp/${ECLIPSE_VERSION}/R/eclipse-inst-jre-linux64.tar.gz&mirror_id=1" -O "${WORK_DIR}/eclipse_ee.tar.gz"
  tar -zxf "${WORK_DIR}/eclipse_ee.tar.gz" --directory /opt

  echo 'Eclipse Enterprise downloaded.'
fi  
 





