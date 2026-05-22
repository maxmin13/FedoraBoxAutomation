#!/bin/bash

##
## Description: Installs minikube and kubectl for local Kubernetes development.
##              minikube lets you run Kubernetes on your own machine -- it creates
##              a local cluster that behaves like a production environment so you
##              can develop and test container workloads without needing cloud
##              access or incurring costs. kubectl is the command-line client used to control
##              any Kubernetes cluster, local or production.
##              Configures minikube to use Docker as the driver and enables the
##              metrics-server addon for the login user.
## Usage:       sudo ./minikube.sh <login-user>
## Parameters:  $1  <login-user>  Non-root desktop username (e.g. maxmin)
##

source /tmp/common.sh

LOGIN_USER="${1:-}"
require_login_user "${LOGIN_USER}"
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
sudo -u "${LOGIN_USER}" sg docker -c "minikube version"
sudo -u "${LOGIN_USER}" sg docker -c "minikube config view"

log_info "minikube driver set to ${DRIVER_NM} for ${LOGIN_USER}."
log_info 'Commands: minikube start --force | stop | status | dashboard | logs'
log_info "To enable metrics-server after first start: minikube addons enable metrics-server"

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
