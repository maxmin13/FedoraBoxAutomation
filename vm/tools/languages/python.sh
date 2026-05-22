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

    wget "https://www.python.org/ftp/python/${PYTHON_VERSION}/Python-${PYTHON_VERSION}.tar.xz" -O "${WORK_DIR}/Python-${PYTHON_VERSION}.tar.xz"

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

log_info "--- venv ---"
log_info "Venv      : ${python_venv_dir}"
log_info "Activate  : source ${python_venv_dir}/bin/activate"
log_info "Deactivate: deactivate"
log_info "Run       : python <file.py>"
log_info "Test      : pytest"
log_info ""
log_info "--- pyenv ---"
log_info "All installed  : pyenv versions"
log_info "Install version: pyenv install 3.13.3"
log_info "Set global     : pyenv global 3.13.3"
log_info "Set per-project: cd <project> && pyenv local 3.11.2  (writes .python-version)"
log_info ""
log_info "--- Visual Studio Code ---"
log_info "  Ctrl+Shift+P -> Python: Select Interpreter"
log_info "  Choose: ~/python_venv_${PYTHON_MINOR}/bin/python"
log_info "  or:     ~/.pyenv/versions/<version>/bin/python"
log_info "  VS Code saves the choice per workspace in .vscode/settings.json"
log_info ""
log_info "NOTE: Log out and back in (or run 'source ~/.bash_profile') for pyenv to take effect."
