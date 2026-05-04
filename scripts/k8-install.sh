#!/bin/bash

source /tmp/common.sh

####
STEP "minikube"
####

# You need to have "passwordless sudo" to have Minikube properly working with Podman.
DRIVER_NM='docker' ## 'podman'

if ! minikube version > /dev/null 2>&1 
then
   wget https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64 -O /usr/local/bin/minikube
   chmod 0755 /usr/local/bin/minikube
   minikube config set driver "${DRIVER_NM}"
fi

minikube version
minikube config view

echo
echo 'Commands:'
echo 'sudo minikube logs'
echo 'sudo minikube config view'
echo 'sudo minikube status'
echo 'sudo minikube start --force'
echo 'sudo minikube stop'
echo 'sudo minikube dashboard'

####
STEP "kubectl"
####

if ! kubectl version --client > /dev/null 2>&1
then
   KUBECTL_VERSION=$(curl -sL https://dl.k8s.io/release/stable.txt)
   wget "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" -O /usr/bin/kubectl
   chmod +x /usr/bin/kubectl
   kubectl version --client
   echo 'kubectl installed.'
else
   echo 'kubectl already installed.'
fi

