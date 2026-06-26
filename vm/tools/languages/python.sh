#!/bin/bash

##
## Description: Installs Python from source, creates a version-specific virtual
##              environment in ~/python_venv_<major.minor>, and installs pytest,
##              boto3, moto, pycodestyle, flake8, and black into it.
##              Also installs pyenv so different Python versions can be selected
##              globally or per project via a .python-version file.
##              Multiple versions can be installed side by side.
##
##              Visual Studio Code integration:
##                Ctrl+Shift+P -> "Python: Select Interpreter"
##                Choose ~/python_venv_<major.minor>/bin/python to use the venv,
##                or ~/.pyenv/versions/<version>/bin/python to use a pyenv version.
##                VS Code saves the choice per workspace in .vscode/settings.json
##                so each project can use a different Python version independently.
## Usage:       sudo ./python.sh <login-user> [version]
## Parameters:  $1  <login-user>  Non-root desktop username (e.g. maxmin)
##              $2  [version]     Python version to install (default: latest stable)
##

source /tmp/common.sh

LOGIN_USER="${1:-}"
require_login_user "${LOGIN_USER}"
HOME_DIR=$(eval echo "~${LOGIN_USER}")
if [[ -n "${2:-}" ]]; then
    PYTHON_VERSION="${2}"
else
    PYTHON_VERSION=$(curl -sL https://endoflife.date/api/python.json | grep -o '"latest":"[^"]*"' | head -1 | sed 's/"latest":"//;s/"//')
    if [[ -z "${PYTHON_VERSION}" ]]; then
        log_error 'Could not determine latest Python version from endoflife.date API.'
        exit 1
    fi
    log_info "Latest stable Python version: ${PYTHON_VERSION}"
fi
PYTHON_MINOR="${PYTHON_VERSION%.*}"
PYTHON_CMD="python${PYTHON_MINOR}"
PYENV_ROOT="${HOME_DIR}/.pyenv"

# make altinstall puts binaries in /usr/local/bin which guestcontrol omits from PATH.
export PATH="/usr/local/bin:${PATH}"

####
STEP "Python dependencies"
####

dnf install -y gcc openssl-devel bzip2-devel libffi-devel zlib-devel wget make \
    readline-devel sqlite sqlite-devel tk-devel xz-devel

####
STEP "Python ${PYTHON_VERSION}"
####

log_info "Python version: ${PYTHON_VERSION}"

version="$(${PYTHON_CMD} -V 2>/dev/null || true)"

if [[ "${version}" =~ "Python ${PYTHON_VERSION}" ]]
then
    log_info "Python ${PYTHON_VERSION} already installed."
else
    log_info "Installing Python ${PYTHON_VERSION} ..."

    WORK_DIR=$(mktemp -d)
    trap 'rm -rf "${WORK_DIR}"' EXIT

    PYTHON_URL="https://www.python.org/ftp/python/${PYTHON_VERSION}/Python-${PYTHON_VERSION}.tar.xz"
    log_info "Downloading Python ${PYTHON_VERSION} from ${PYTHON_URL} ..."
    wget -q --tries=3 "${PYTHON_URL}" -O "${WORK_DIR}/Python-${PYTHON_VERSION}.tar.xz"

    tar -xf "${WORK_DIR}/Python-${PYTHON_VERSION}.tar.xz" -C "${WORK_DIR}"

    cd "${WORK_DIR}/Python-${PYTHON_VERSION}"
    ./configure

    # make altinstall avoids replacing the system /usr/bin/python binary
    make -j 4
    make altinstall

    ${PYTHON_CMD} -V
    log_info "Python ${PYTHON_VERSION} successfully installed."
fi

${PYTHON_CMD} -m pip install --root-user-action=ignore --upgrade pip

####
STEP "Virtual environment"
####

python_venv_dir="${HOME_DIR}/python_venv_${PYTHON_MINOR}"

if [[ ! -d "${python_venv_dir}" ]]
then
    log_info "Creating virtual environment in ${python_venv_dir} ..."
    log_info "Installing packages: pytest boto3 moto[all] pycodestyle flake8 black (this may take a few minutes) ..."
    ${PYTHON_CMD} -m venv "${python_venv_dir}"
    source "${python_venv_dir}/bin/activate"
    python -m pip install pytest boto3 moto[all] pycodestyle flake8 black -U
    deactivate
    chown -R "${LOGIN_USER}:${LOGIN_USER}" "${python_venv_dir}"
    log_info 'Virtual environment created.'
else
    log_info "Virtual environment already exists at ${python_venv_dir}, skipping."
fi

####
STEP "pyenv"
####

if [[ ! -d "${PYENV_ROOT}" ]]
then
    log_info 'Installing pyenv ...'
    sudo -u "${LOGIN_USER}" git clone https://github.com/pyenv/pyenv.git "${PYENV_ROOT}"
    chown -R "${LOGIN_USER}:${LOGIN_USER}" "${PYENV_ROOT}"
    log_info 'pyenv installed.'
else
    log_info 'pyenv already installed.'
fi

BASH_PROFILE="${HOME_DIR}/.bash_profile"
if ! grep -q 'PYENV_ROOT' "${BASH_PROFILE}"
then
    cat >> "${BASH_PROFILE}" <<'EOF'

export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init -)"
EOF
    log_info 'pyenv added to ~/.bash_profile.'
else
    log_info 'pyenv already in ~/.bash_profile.'
fi

log_info "-------------------------------------------------------"
log_info " Python ${PYTHON_VERSION} quick-reference"
log_info "-------------------------------------------------------"
log_info " Smoke tests:"
log_info "   ${PYTHON_CMD} -V"
log_info "   ${PYTHON_CMD} -c \"import sys; print(sys.version)\""
log_info "   ${PYTHON_CMD} -c \"import json; print(json.dumps({'status': 'ok'}))\""
log_info ""
log_info " NOTE: 'python3' still points to the Fedora system Python."
log_info " Use '${PYTHON_CMD}' or activate the venv to use this version."
log_info " All source-built versions: ls /usr/local/bin/python3.*"
log_info " Each version has its own venv: ~/python_venv_<major.minor>"
log_info ""
log_info " Virtual environment (pytest, boto3, moto, flake8, black included):"
log_info "   Activate  : source ${python_venv_dir}/bin/activate"
log_info "   Deactivate: deactivate"
log_info "   Test      : pytest"
log_info ""
log_info " pyenv (separate install manager, does not see this Python):"
log_info "   pyenv versions        list pyenv-managed versions"
log_info "   pyenv global 3.12.7   set shell default"
log_info "   pyenv local 3.11.9    per-project override (.python-version)"
log_info "   source ~/.bash_profile  (or log out) to activate pyenv"
log_info ""
log_info " VS Code: Ctrl+Shift+P -> Python: Select Interpreter"
log_info "   ${python_venv_dir}/bin/python"
log_info "-------------------------------------------------------"
