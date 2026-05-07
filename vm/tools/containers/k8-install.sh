#!/bin/bash

##
## Description: Installs minikube (configured to use Docker as the driver) and
##              kubectl (latest stable release) for local Kubernetes development.
##              Sets minikube driver config and enables the metrics-server addon
##              for the login user.
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
STEP "Docker check"
####

if ! docker --version > /dev/null 2>&1; then
    log_error 'Docker is not installed. Run docker.sh before k8-install.sh.'
    exit 1
fi
log_info "Docker found: $(docker --version)"

####
STEP "minikube"
####

DRIVER_NM='docker'

if ! minikube version > /dev/null 2>&1
then
    wget https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64 -O /usr/local/bin/minikube
    chmod 0755 /usr/local/bin/minikube
    log_info 'minikube installed.'
fi

sudo -u "${LOGIN_USER}" sg docker -c "minikube config set driver ${DRIVER_NM}"
sudo -u "${LOGIN_USER}" sg docker -c "minikube addons enable metrics-server"
sudo -u "${LOGIN_USER}" sg docker -c "minikube version"
sudo -u "${LOGIN_USER}" sg docker -c "minikube config view"

log_info "minikube driver set to ${DRIVER_NM} for ${LOGIN_USER}."
log_info 'Commands: minikube start --force | stop | status | dashboard | logs'

####
STEP "kubectl"
####

if ! kubectl version --client > /dev/null 2>&1
then
    KUBECTL_VERSION=$(curl -sL https://dl.k8s.io/release/stable.txt)
    if [[ -z "${KUBECTL_VERSION}" ]]; then
        log_error 'Could not determine latest kubectl version.'
        exit 1
    fi
    log_info "Installing kubectl ${KUBECTL_VERSION} ..."
    wget "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" -O /usr/bin/kubectl
    chmod 0755 /usr/bin/kubectl
    log_info 'kubectl installed.'
else
    log_info 'kubectl already installed.'
fi

kubectl version --client

log_info "minikube  : minikube start --force | stop | status | dashboard | logs"
log_info "kubectl   : kubectl get pods | get nodes | get services | describe pod <name>"
log_info "Apply     : kubectl apply -f <file.yaml>"
log_info "Delete    : kubectl delete -f <file.yaml>"
log_info "Logs      : kubectl logs <pod>"
log_info "Exec      : kubectl exec -it <pod> -- /bin/bash"
log_info "Context   : kubectl config get-contexts | use-context <name>"
