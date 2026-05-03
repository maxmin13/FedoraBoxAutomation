#!/bin/bash

set -o errexit
set -o pipefail
set -o nounset
set +o xtrace

STEP() { echo ; echo ; echo "==\\" ; echo "===>" "$@" ; echo "==/" ; echo ; }

####
STEP "AWS client"
####

if ! aws --version > /dev/null 2>&1 
then
   mkdir -p ./tempcli && cd ./tempcli
   
   curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"

   unzip awscliv2.zip

   ./aws/install

   echo 'AWS client installed.'
   echo 'Configure AWS client by running:'
   echo 'aws configure'
   
   cd ..
   rm -rf ./tempcli
else
   echo 'AWS client already installed.'
fi

aws --version