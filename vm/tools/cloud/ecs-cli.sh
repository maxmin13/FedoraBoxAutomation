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

if ! /usr/local/bin/ecs-cli --version > /dev/null 2>&1; then
    curl -#Lo /usr/local/bin/ecs-cli https://amazon-ecs-cli.s3.amazonaws.com/ecs-cli-linux-amd64-latest \
        || { log_error 'Download from Amazon S3 failed — check your internet connection and try again.'; exit 1; }
    chmod +x /usr/local/bin/ecs-cli
    log_info 'ECS CLI installed.'
else
    log_info 'ECS CLI already installed.'
fi

log_info "Installed version: $(/usr/local/bin/ecs-cli --version 2>&1)"

log_info "---"
log_info "Next steps:"
log_info "  Check version:           ecs-cli --version"
log_info "  1. Configure a cluster:  ecs-cli configure --cluster <name> --default-launch-type FARGATE --region <region> --config-name <name>"
log_info "  2. Set credentials:      ecs-cli configure profile --access-key <key> --secret-key <secret> --profile-name <name>"
log_info "  3. Create the cluster:   ecs-cli up --cluster-config <name> --ecs-profile <name>"
log_info "  4. Deploy a service:     ecs-cli compose --project-name <name> service up"
log_info "  5. Check running tasks:  ecs-cli ps"
log_info "  Note: AWS CLI must also be configured ('aws configure') before using ecs-cli."
log_info "---"