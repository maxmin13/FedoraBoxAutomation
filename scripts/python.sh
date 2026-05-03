#!/bin/bash

set -o errexit
set -o pipefail
set -o nounset
set +o xtrace

STEP() { echo ; echo ; echo "==\\" ; echo "===>" "$@" ; echo "==/" ; echo ; }

if [[ 0 -eq $# ]] 
then
   echo 'ERROR: login user not found.'
   exit 1
fi

####
STEP 'python'
####

LOGIN_USER="${1}"

dnf update -y
dnf install gcc openssl-devel bzip2-devel libffi-devel zlib-devel wget make 

version="$(python3.11 -V)"

if [[ "${version}" =~ .*'Python 3.11.2'.* ]]
then
   echo 
   echo 'Python 3.11.2 alredy installed.'
else
   echo
   echo 'Installing Python 3.11.2 ...'

   cd /usr/src
   rm -rf Python-3.11.2
   rm -rf Python-3.11.2.tar.xz
   wget https://www.python.org/ftp/python/3.11.2/Python-3.11.2.tar.xz

   tar -xf Python-3.11.2.tar.xz

   cd Python-3.11.2
   ./configure --enable-optimizations

   # make altinstall is used to prevent replacing the default python binary file /usr/bin/python .
   make -j 4
   make altinstall

   rm -rf Python-3.11.2
   rm -rf Python-3.11.2.tar.xz

   python --version
   python3.11 -V 
   
   echo 'Python 3.11.2 successfully installed.'  
fi

python3.11 -m pip install --root-user-action=ignore --upgrade pip

echo
python_venv_dir=/home/"${LOGIN_USER}"/python_venv
echo "Creating a Python virtual envirnoment in ${python_venv_dir}"

mkdir -p "${python_venv_dir}" 
python3.11 -m venv "${python_venv_dir}"
source "${python_venv_dir}"/bin/activate
which python

echo "Python virtual envirnoment created!"
echo

python -m pip install pytest boto3 moto[all] pycodestyle flake8 black -U

deactivate

chown -R "${LOGIN_USER}:${LOGIN_USER}" "${python_venv_dir}"
