#!/usr/bin/env bash

set -o errexit      # Stop on error (like `-e`)
set -o nounset      # Stop on unset vars (like `-u`)
set -o pipefail     # Fail on first failed command in a pipeline
set -o errtrace     # Trap ERR in functions and subshells

trap 'echo "❌ Script failed on line $LINENO with exit code $?"' ERR

# --- DEFAULTS ---
RUNNER_NAME="$(hostname)-runner"
RUNNER_DIR="/opt/github-runner"

# --- USAGE ---
usage() {
  echo "Usage: $0 [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --owner         GitHub org or username (required)"
  echo "  --repo          GitHub repository name (optional for org-level runner)"
  echo "  --token         GitHub PAT or registration token (required)"
  echo "  --scope         'repo' or 'org' (default: repo)"
  echo "  --name          Runner name (default: <hostname>-runner)"
  echo "  --labels        Comma-separated list of runner labels"
  echo "  --dir           Runner install directory (default: /opt/github-runner)"
  echo "  --env           infrastructure environment name"
  echo "  -h, --help      Show this help message"
  echo ""
  exit 1
}

# --- PARSE OPTIONS ---
SCOPE="repo"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --owner) GITHUB_OWNER="$2"; shift 2 ;;
    --repo) REPO_NAME="$2"; shift 2 ;;
    --token) GITHUB_TOKEN="$2"; shift 2 ;;
    --scope) SCOPE="$2"; shift 2 ;;
    --name) RUNNER_NAME="$2"; shift 2 ;;
    --labels) LABELS="$2"; shift 2 ;;
    --dir) RUNNER_DIR="$2"; shift 2 ;;
    --env) ENV="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

# --- INTERACTIVE PROMPTS (IF NOT SET) ---
[[ -z "${GITHUB_OWNER:-}" ]] && read -rp "GitHub owner (or org): " GITHUB_OWNER
[[ -z "${GITHUB_TOKEN:-}" ]] && read -rsp "GitHub token (no echo): " GITHUB_TOKEN && echo
[[ -z "${SCOPE:-}" ]] && read -rp "Scope (repo|org) [repo]: " SCOPE && SCOPE="${SCOPE:-repo}"
[[ "${SCOPE}" == "repo" && -z "${REPO_NAME:-}" ]] && read -rp "Repository name: " REPO_NAME
[[ -z "${ENV:-}" ]] && read -rp "Infrastructure environment name: " ENV

# --- Add runner labels ---
LABELS="self-hosted,linux,node,${ENV}"

# --- DETERMINE REGISTRATION URL ---
if [[ "$SCOPE" == "org" ]]; then
  REG_URL="https://api.github.com/orgs/${GITHUB_OWNER}/actions/runners/registration-token"
  RUNNER_SCOPE="https://github.com/${GITHUB_OWNER}"
elif [[ "$SCOPE" == "repo" ]]; then
  REG_URL="https://api.github.com/repos/${GITHUB_OWNER}/${REPO_NAME}/actions/runners/registration-token"
  RUNNER_SCOPE="https://github.com/${GITHUB_OWNER}/${REPO_NAME}"
else
  echo "Invalid SCOPE value. Must be 'repo' or 'org'."
  exit 1
fi

# --- INSTALL DEPENDENCIES ---
echo "[+] Installing dependencies..."
sudo apt-get update -qq
sudo apt-get install -y curl jq tar

# --- CREATE RUNNER DIR ---
sudo mkdir -p "${RUNNER_DIR}"
sudo chown $(id -u):$(id -g) "${RUNNER_DIR}"
cd "${RUNNER_DIR}"

# --- DOWNLOAD RUNNER ---
if [[ ! -f "runner.tar.gz" ]]; then
  echo "[+] Downloading GitHub runner..."

  RUNNER_LATEST_URL=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest \
    | jq -r '.assets[] | select(.name | test("linux-x64")) | .browser_download_url')

  if [[ -z "$RUNNER_LATEST_URL" ]]; then
    echo "❌ Failed to fetch GitHub runner URL. Check your internet connection and 'jq'."
    exit 1
  fi

  echo "[+] Download URL: $RUNNER_LATEST_URL into folder $(pwd)"
  if ! curl -fL "$RUNNER_LATEST_URL" -o runner.tar.gz; then
    echo "❌ Failed to download runner archive."
    exit 1
  fi
else
  echo "[i] runner.tar.gz already exists. Skipping download."
fi

echo "[+] Extracting runner..."
tar xzf runner.tar.gz

# --- GET REGISTRATION TOKEN ---
echo "[+] Requesting registration token..."
REG_TOKEN=$(curl -s -X POST \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  "${REG_URL}" | jq -r .token)

# --- CONFIGURE RUNNER ---
echo "[+] Configuring runner..."
./config.sh \
  --unattended \
  --url "${RUNNER_SCOPE}" \
  --token "${REG_TOKEN}" \
  --name "${RUNNER_NAME}" \
  --labels "${LABELS}" \
  --work "_work"

# --- SETUP SYSTEMD SERVICE ---
echo "[+] Installing systemd service..."
sudo ./svc.sh install
sudo ./svc.sh start

echo "✅ Runner '${RUNNER_NAME}' is installed and started!"
