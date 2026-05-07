#!/bin/bash

##
## Description: Installs the Amazon ECS CLI, a tool for running and managing
##              containers on Amazon Elastic Container Service clusters.
## Usage:       sudo ./ecs-cli.sh
## Parameters:  none
##

source /tmp/common.sh

####
STEP "ECS client"
####

if ! ecs-cli --version > /dev/null 2>&1
then
    curl -#Lo /usr/local/bin/ecs-cli https://amazon-ecs-cli.s3.amazonaws.com/ecs-cli-linux-amd64-latest
    chmod +x /usr/local/bin/ecs-cli
    log_info 'ECS CLI installed.'
else
    log_info 'ECS CLI already installed.'
fi

ecs-cli --version