#!/bin/bash

##
## Description: Installs Cisco Packet Tracer on Fedora by extracting a .deb
##              package, copying files to /usr and /opt, and registering
##              GNOME desktop entries and MIME types.
## Usage:       sudo ./packettracer.sh <provision-dir> <installer.deb>
## Note:        Installer .deb must be downloaded from https://www.netacad.com/portal/learning
##

source /tmp/common.sh

if [[ 2 -gt $# ]]
then
   log_error 'missing parameters.'
   log_error 'Usage: sudo ./packettracer.sh <provision-dir> <installer.deb>'
   exit 1
fi

PROVISION_DIR="${1}"
PROVISION_FILE="${2}"

# Resolve full path before any cd
if [[ "${PROVISION_FILE}" != /* ]]; then
   PROVISION_FILE="$(pwd)/${PROVISION_FILE}"
fi

if [[ ! -f "${PROVISION_FILE}" ]]; then
   log_error "installer file not found: ${PROVISION_FILE}"
   exit 1
fi

if [[ "${PROVISION_FILE}" != *.deb ]]; then
   log_error "expected a .deb file, got: ${PROVISION_FILE}"
   exit 1
fi

for cmd in ar tar xdg-desktop-menu gtk-update-icon-cache update-mime-database xdg-mime; do
   if ! command -v "${cmd}" &> /dev/null; then
      log_error "required command not found: ${cmd}"
      exit 1
   fi
done

STEP 'PacketTracer'

if [[ -d /opt/pt ]]
then
   log_info 'PacketTracer already installed.'
   exit 0
fi

cd "${PROVISION_DIR}"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "${WORK_DIR}"' EXIT

# Extract debian package
ar -xv "${PROVISION_FILE}" --output "${WORK_DIR}"

mkdir -p "${WORK_DIR}/control"
mkdir -p "${WORK_DIR}/data"
tar -C "${WORK_DIR}/control" -Jxf "${WORK_DIR}/control.tar.xz"
tar -C "${WORK_DIR}/data"    -Jxf "${WORK_DIR}/data.tar.xz"

cp -r "${WORK_DIR}/data/usr" /
cp -r "${WORK_DIR}/data/opt" /

# Register GNOME desktop entries
xdg-desktop-menu install /usr/share/applications/cisco-pt.desktop
xdg-desktop-menu install /usr/share/applications/cisco-ptsa.desktop
update-mime-database /usr/share/mime
gtk-update-icon-cache --force --ignore-theme-index /usr/share/icons/gnome
xdg-mime default cisco-ptsa.desktop x-scheme-handler/pttp
ln -sf /opt/pt/PacketTracer /usr/local/bin/PacketTracer

log_info 'PacketTracer installed. Reboot the system.'
