#!/bin/bash

set -o errexit
set -o pipefail
set -o nounset
set +o xtrace

STEP() { echo ; echo ; echo "==\\" ; echo "===>" "$@" ; echo "==/" ; echo ; }

####
STEP "Eclipse Enterprise"
####


if [[ -d '/opt/eclipse-installer' ]]
then
	echo 'Eclipse enterprise already downloaded.'
else
  cd /usr/src
  wget https://mirror.dkm.cz/eclipse/oomph/epp/2023-12/R/eclipse-inst-jre-linux64.tar.gz -O eclipse_ee.tar.gz
  tar -zxf eclipse_ee.tar.gz --directory /opt 
  
  echo 'Eclipse Enterprise downloaded.'
fi  
 





