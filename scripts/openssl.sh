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
STEP 'OpenSSL'
####

LOGIN_USER="${1}"
#OPENSSL_VERSION="3.0.7"
OPENSSL_VERSION="1.1.1u"
OPENSSL_DIR="/usr/local/ssl"
OPENSSL_SRC_DIR="/usr/local/src"

yum update -y
yum group install "development-tools" -y
yum install -y perl-core zlib-devel -y

set +e
version="$(openssl version)"
set -e

if [[ "${version}" =~ .*"${OPENSSL_VERSION}".* ]]
then
   echo 
   echo "OpenSSL ${OPENSSL_VERSION} already installed."
else
   echo
   echo "Installing OpenSSL ${OPENSSL_VERSION} ..."
   
   rm -rf "${OPENSSL_DIR}"
   mkdir -p "${OPENSSL_DIR}"
   rm -rf "${OPENSSL_SRC_DIR}"
   mkdir -p "${OPENSSL_SRC_DIR}"
   cd "${OPENSSL_SRC_DIR}"
   
   wget https://www.openssl.org/source/openssl-"${OPENSSL_VERSION}".tar.gz
   tar -xf openssl-"${OPENSSL_VERSION}".tar.gz
   cd openssl-"${OPENSSL_VERSION}"
   
   ./config --prefix="${OPENSSL_DIR}" --openssldir="${OPENSSL_DIR}" shared zlib

   make clean && make
   make test
   make install
   
   rm -f /etc/ld.so.conf.d/openssl-"${OPENSSL_VERSION}".conf
   sh -c "echo ${OPENSSL_DIR}/lib64" > /etc/ld.so.conf.d/openssl-"${OPENSSL_VERSION}".conf
   
   ldconfig -v
  
   if ! grep -q "openssl" "/home/${LOGIN_USER}/.bash_profile"; then 
     {
        echo "";
	    echo "PATH=$PATH:${OPENSSL_DIR}/bin";
	    echo "export PATH";
	 } >> /home/"${LOGIN_USER}"/.bash_profile
   fi  
      
   rm -rf "${OPENSSL_SRC_DIR}"
   
   echo "OpenSSL ${OPENSSL_VERSION} successfully installed."
fi

echo
