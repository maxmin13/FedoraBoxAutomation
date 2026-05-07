#!/bin/bash

##
## Description: Installs Docker CE from the official Docker repository, starts
##              and enables the Docker service, runs a hello-world smoke test,
##              and adds the login user to the docker group.
## Usage:       sudo ./docker.sh <login-user>
## Parameters:  $1  <login-user>  Non-root desktop username (e.g. maxmin)
##

source /tmp/common.sh

if [[ 0 -eq $# ]]
then
    log_error 'login user not found.'
    exit 1
fi

LOGIN_USER="${1}"

####
STEP "Docker"
####

if ! docker version > /dev/null 2>&1
then
    dnf install -y dnf-plugins-core
    dnf config-manager addrepo --from-repofile=https://download.docker.com/linux/fedora/docker-ce.repo
    dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    systemctl start docker
    systemctl enable docker
    docker run hello-world
    log_info 'Docker successfully installed.'
else
    log_info 'Docker already installed.'
fi

systemctl status docker --no-pager
docker version

if ! groups "${LOGIN_USER}" | grep -q docker
then
    usermod -aG docker "${LOGIN_USER}"
    log_info "${LOGIN_USER} added to docker group."
else
    log_info "${LOGIN_USER} already in docker group."
fi
