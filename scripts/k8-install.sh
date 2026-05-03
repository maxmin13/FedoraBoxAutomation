#!/bin/bash

set -o errexit
set -o pipefail
set -o nounset
set +o xtrace

STEP() { echo ; echo ; echo "==\\" ; echo "===>" "$@" ; echo "==/" ; echo ; }

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

set +e
kubectl version --client > /dev/null 2>&1
exit_code=$?
set -e

if [[ 0 -ne $exit_code ]]
then
   wget https://dl.k8s.io/release/v1.23.0/bin/linux/amd64/kubectl -O /usr/bin/kubectl
   chmod +x /usr/bin/kubectl
   kubectl version --client 
   echo 'kubectl installed.'
else
   echo 'kubectl already installed.'
fi

