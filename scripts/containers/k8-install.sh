#!/bin/bash

##
## Description: Installs minikube (configured to use Docker as the driver) and
##              kubectl (latest stable release) for local Kubernetes development.
##              Sets minikube driver config for the login user.
## Usage:       sudo ./k8-install.sh <login-user>
## Parameters:  $1  <login-user>  Non-root desktop username (e.g. maxmin)
##

source /tmp/common.sh

if [[ 0 -eq $# ]]
then
    log_error 'login user not found.'
    exit 1
fi

LOGIN_USER="${1}"
HOME_DIR=$(eval echo "~${LOGIN_USER}")

####
STEP "minikube"
####

DRIVER_NM='docker'

if ! minikube version > /dev/null 2>&1
then
    wget --progress=dot https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64 -O /usr/local/bin/minikube
    chmod 0755 /usr/local/bin/minikube
    log_info 'minikube installed.'
fi

sudo -u "${LOGIN_USER}" minikube config set driver "${DRIVER_NM}"
sudo -u "${LOGIN_USER}" minikube version
sudo -u "${LOGIN_USER}" minikube config view

log_info "minikube driver set to ${DRIVER_NM} for ${LOGIN_USER}."
log_info 'Commands: minikube start --force | stop | status | dashboard | logs'

####
STEP "kubectl"
####

if ! kubectl version --client > /dev/null 2>&1
then
   KUBECTL_VERSION=$(curl -sL https://dl.k8s.io/release/stable.txt)
   wget --progress=dot "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" -O /usr/bin/kubectl
   chmod +x /usr/bin/kubectl
   kubectl version --client
   echo 'kubectl installed.'
else
   echo 'kubectl already installed.'
fi

