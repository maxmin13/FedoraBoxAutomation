#!/bin/bash

##
## Description: Installs Docker CE from the official Docker repository, starts
##              and enables the Docker service, runs a hello-world smoke test,
##              and adds the login user to the docker group.
## Usage:       sudo ./docker.sh <login-user>
##

source /tmp/common.sh

if [[ 1 -gt $# ]] 
then
   echo 'ERROR: missing parameters.'
   exit 1
fi

LOGIN_USER="${1}"

uname -r

####
STEP "docker"
####

# kernel version 3.10 or greater is needed.
uname -r

if ! docker version > /dev/null 2>&1
then
   dnf -y install dnf-plugins-core
   dnf-3 config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
   dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

   systemctl start docker
   systemctl enable docker
   docker run hello-world
   log_info 'Docker successfully installed.'
else
   log_info 'Docker already installed.'
fi

systemctl status docker
docker version

if ! groups "${LOGIN_USER}" | grep docker
then
   usermod -aG docker "${LOGIN_USER}"
   
   echo "${LOGIN_USER} added to docker group."
else
   echo "${LOGIN_USER} already added to docker group."
fi
