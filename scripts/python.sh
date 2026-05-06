#!/bin/bash

##
## Description: Installs Python 3.11.2 from source, creates a virtual
##              environment in ~/python_venv, and installs pytest, boto3,
##              moto, pycodestyle, flake8, and black into it.
## Usage:       sudo ./python.sh <login-user>
##

source /tmp/common.sh

if [[ 0 -eq $# ]] 
then
   log_error 'login user not found.'
   exit 1
fi

####
STEP 'python'
####

LOGIN_USER="${1}"
HOME_DIR=$(eval echo "~${LOGIN_USER}")

dnf update -y
dnf install gcc openssl-devel bzip2-devel libffi-devel zlib-devel wget make 

version="$(python3.11 -V)"

if [[ "${version}" =~ .*'Python 3.11.2'.* ]]
then
   log_info 'Python 3.11.2 already installed.'
else
   log_info 'Installing Python 3.11.2 ...'

   WORK_DIR=$(mktemp -d)
   trap 'rm -rf "${WORK_DIR}"' EXIT

   wget --progress=dot https://www.python.org/ftp/python/3.11.2/Python-3.11.2.tar.xz -O "${WORK_DIR}/Python-3.11.2.tar.xz"

   tar -xf "${WORK_DIR}/Python-3.11.2.tar.xz" -C "${WORK_DIR}"

   cd "${WORK_DIR}/Python-3.11.2"
   ./configure --enable-optimizations

   # make altinstall is used to prevent replacing the default python binary file /usr/bin/python .
   make -j 4
   make altinstall

   python --version
   python3.11 -V

   log_info 'Python 3.11.2 successfully installed.'
fi

python3.11 -m pip install --root-user-action=ignore --upgrade pip

python_venv_dir="${HOME_DIR}/python_venv"
log_info "Creating Python virtual environment in ${python_venv_dir}"

mkdir -p "${python_venv_dir}"
python3.11 -m venv "${python_venv_dir}"
source "${python_venv_dir}/bin/activate"
command -v python

log_info 'Python virtual environment created.'

python -m pip install pytest boto3 moto[all] pycodestyle flake8 black -U

deactivate

chown -R "${LOGIN_USER}:${LOGIN_USER}" "${python_venv_dir}"
