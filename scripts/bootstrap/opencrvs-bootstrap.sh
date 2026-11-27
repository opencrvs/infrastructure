#!/usr/bin/env bash

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
#
# OpenCRVS is also distributed under the terms of the Civil Registration
# & Healthcare Disclaimer located at http://opencrvs.org/license.
#
# Copyright (C) The OpenCRVS Authors located at https://github.com/opencrvs/opencrvs-core/blob/master/AUTHORS.

# Script to bootstrap a server as OpenCRVS infrastructure node
# - Creates 'provision' user if not exists
# - Installs and configures GitHub Actions runner to connect to the specified repos
# - Can be used for both master and worker nodes
set -e

# Managed by the release workflow, see .github/workflows/init-release.yml
INFRASTRUCTURE_VERSION="v2.2.0"
CREATE_PROVISION_USER_SHA256="5111770e1752769133d5366fcaf17b4f10277e0546b02d9a2e0ddfea764f1f4c"
NODE_RUNNER_SHA256="3bc5536d89dc68f82ed20d2071fad575b1d62262cf1780ccda339255964f9bce"

# Configurable params
PROVISION_USER="provision"
PROVISION_GROUP="provision"
MIN_UBUNTU_VERSION="24.04"
REQUIRED_URLS=(
    "https://raw.githubusercontent.com/"
    "https://packages.buildkite.com"
    "https://pkgs.k8s.io"
    "https://archive.ubuntu.com"
    "https://changelogs.ubuntu.com"
    "https://hub.docker.com"
    "https://auth.docker.io"
    "https://registry-1.docker.io"
    "https://download.docker.com"
    "https://sentry.io"
    "https://fonts.gstatic.com"
    "https://storage.googleapis.com"
    "https://fonts.googleapis.com"
    "https://github.com"
    "https://acme-v02.api.letsencrypt.org"
    "https://registry.npmjs.org"
    "https://registry.yarnpkg.com"
    "https://eu.ui-avatars.com"
)


# --- Helper Functions --- #
abort() { echo "ERROR: $1"; exit 1; }

# --- USAGE ---
usage() {
  echo """
Usage: $0 [OPTIONS]

Options required for master node:
    --owner           GitHub org or username (required)
    --repo            GitHub repository name (required)
    --env             Infrastructure environment name(s) comma-separated (required)
                        Runner will be used to provision infrastructure for these envs
                        For example: dev,qa,staging or prod
    --enable-runner   Whether to enable the runner after installation (default: true)
Options Required for worker node:
    --ssh-public-key  Add ssh public key to add to the user instead of generating a new key pair
Help:
    -h, --help      Show this help message

Environment:
    GITHUB_TOKEN      GitHub PAT or registration token. Needed with --enable-runner.
                        The script asks for it if the variable is empty.
                        It is not an option, because an option shows in the process list and in the shell history.
"""
  exit 1
}

# --- PARSE OPTIONS ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --owner) GITHUB_OWNER="$2"; shift 2 ;;
    --repo) REPO_NAME="$2"; shift 2 ;;
    --token) abort "--token is not supported anymore, because the token would show in the process list and in the shell history. Set the GITHUB_TOKEN environment variable, or leave it empty and the script asks for it." ;;
    --env) ENV="$2"; shift 2 ;;
    --enable-runner) ENABLE_RUNNER=true; shift ;;
    --ssh-public-key) SSH_PUBLIC_KEY="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

check_ubuntu_version() {
    echo "Checking Ubuntu version..."

    UBUNTU_VERSION=$(lsb_release -rs)

    if ! dpkg --compare-versions "$UBUNTU_VERSION" ge "$MIN_UBUNTU_VERSION"; then
        abort "Ubuntu $MIN_UBUNTU_VERSION or newer is required, found $UBUNTU_VERSION"
    fi

    echo "Ubuntu version OK."
}

curl_check_url() {
    local url="$1"
    local http_code
    local attempt

    for attempt in 1 2 3; do
        http_code="$(curl \
            --silent \
            --location \
            --head \
            --max-time 10 \
            --output /dev/null \
            --write-out "%{http_code}" \
            "$url" || true)"

        # 000 means curl could not connect / DNS failed / TLS failed / timed out.
        if [ "$http_code" != "000" ]; then
            return 0
        fi

        [ "$attempt" -lt 3 ] && sleep 3
    done

    return 1
}

check_internet() {
    local failed=0

    echo "Testing outbound HTTPS connectivity..."
    echo

    printf "%-40s %-10s\n" "URL" "STATUS"
    printf "%-40s %-10s\n" "----------------------------------------" "----------"

    for url in "${REQUIRED_URLS[@]}"; do
        if curl_check_url "$url"; then
            printf "%-45s %-10s\n" "$url" "OK"
        else
            printf "%-45s %-10s\n" "$url" "FAILED"
            failed=1
        fi
    done

    echo

    if [ "$failed" -ne 0 ]; then
        abort "Internet connectivity check failed. Some required endpoints are unreachable."
    fi

    echo "Internet connectivity OK."
}

# The token comes from the GITHUB_TOKEN environment variable. If the variable is
# empty, the script asks for it. It is only needed to install the runner.
read_github_token() {
    [ "${ENABLE_RUNNER:-}" = "true" ] || return 0
    [ -z "${GITHUB_TOKEN:-}" ] || return 0

    printf "GitHub PAT or registration token (no echo): "
    read -rs GITHUB_TOKEN

    [ -n "$GITHUB_TOKEN" ] || abort "The GitHub token is empty. Set the GITHUB_TOKEN environment variable."
}

# Downloads a helper script and verify SHA-256.
download_script() {
    local name="$1"
    local expected_sha256="$2"
    local url="https://raw.githubusercontent.com/opencrvs/infrastructure/${INFRASTRUCTURE_VERSION}/scripts/bootstrap/${name}"
    local file="${WORK_DIR}/${name}"
    local actual_sha256

    curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "$url" --output "$file" \
        || abort "Could not download $url. If ${INFRASTRUCTURE_VERSION} is a new release, check that it is published."

    actual_sha256="$(sha256sum "$file" | cut -d ' ' -f 1)"
    if [ "$actual_sha256" != "$expected_sha256" ]; then
        abort "SHA-256 of $name does not match. Expected $expected_sha256, got $actual_sha256. The script is not run."
    fi

    chmod +x "$file"
    echo "Downloaded $name ${INFRASTRUCTURE_VERSION}, SHA-256 OK."
}

# ---- MAIN ---- #

read_github_token

echo "Running basic checks..."
check_ubuntu_version
check_internet

echo "Downloading dependencies..."
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
download_script create-provision-user.sh "$CREATE_PROVISION_USER_SHA256"
download_script node-runner.sh "$NODE_RUNNER_SHA256"

"$WORK_DIR/create-provision-user.sh" --ssh-public-key "$SSH_PUBLIC_KEY"
# The token is passed in the environment of the runner script, not as an option.
[ "x$ENABLE_RUNNER" == "xtrue" ] && GITHUB_TOKEN="$GITHUB_TOKEN" "$WORK_DIR/node-runner.sh" --env "${ENV}" \
                                                        --owner "${GITHUB_OWNER}" \
                                                        --repo "${REPO_NAME}"

echo ""
sudo [ -f "/home/$PROVISION_USER/.ssh/id_ed25519.pub" ] && \
echo "
⚠️ ⚠️ ⚠️ ⚠️ ⚠️ Store the following public key for later usage ⚠️ ⚠️ ⚠️ ⚠️ ⚠️
⚙️  $PROVISION_USER SSH key pair public key (add on worker nodes if needed):
" && \
sudo cat /home/$PROVISION_USER/.ssh/id_ed25519.pub
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ✅ Node bootstrap complete for $(hostname)."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
