#!/bin/bash

# Amazon Elastic Container Service (Amazon ECS) is a highly scalable and fast container management service. 
# You can use it to run, stop, and manage containers on a cluster.

set -o errexit
set -o pipefail
set -o nounset
set +o xtrace

STEP() { echo ; echo ; echo "==\\" ; echo "===>" "$@" ; echo "==/" ; echo ; }

####
STEP "ECS client"
####

if ! ecs-cli --version > /dev/null 2>&1 
then 
   curl -Lo /usr/local/bin/ecs-cli https://amazon-ecs-cli.s3.amazonaws.com/ecs-cli-linux-amd64-latest
   chmod +x /usr/local/bin/ecs-cli

   echo 'ECS client installed.'
else
   echo 'ECS client already installed.'
fi

ecs-cli --version