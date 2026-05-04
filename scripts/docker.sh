#!/bin/bash

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
fi 

systemctl status docker
docker version
docker run hello-world

echo 'Docker successfully installed'

if ! groups "${LOGIN_USER}" | grep docker
then
   usermod -aG docker "${LOGIN_USER}"
   
   echo "${LOGIN_USER} added to docker group."
else
   echo "${LOGIN_USER} already added to docker group."
fi
