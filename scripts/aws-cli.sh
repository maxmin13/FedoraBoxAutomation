#!/bin/bash

source /tmp/common.sh

####
STEP "AWS client"
####

WORK_DIR=$(mktemp -d)
trap 'rm -rf "${WORK_DIR}"' EXIT

if ! aws --version > /dev/null 2>&1
then
   curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "${WORK_DIR}/awscliv2.zip"

   unzip "${WORK_DIR}/awscliv2.zip" -d "${WORK_DIR}"

   "${WORK_DIR}/aws/install"

   echo 'AWS client installed.'
   echo 'Configure AWS client by running:'
   echo 'aws configure'
else
   echo 'AWS client already installed.'
fi

aws --version