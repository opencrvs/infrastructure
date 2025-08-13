#!/bin/bash
set -e

# Configurable params
PROVISION_UID=1000
PROVISION_GID=1000
PROVISION_USER="provision"
BACKUP_USER="backup"
MIN_UBUNTU_VERSION="24.04"
MIN_DISK_SPACE_GB=50  # Set min required root disk space

# --- Helper Functions --- #
abort() { echo "ERROR: $1"; exit 1; }

check_ubuntu_version() {
    echo "Checking Ubuntu version..."
    UBUNTU_VERSION=$(lsb_release -rs)
    if [ "$UBUNTU_VERSION" != "$MIN_UBUNTU_VERSION" ]; then
      abort "Ubuntu $MIN_UBUNTU_VERSION is required, found $UBUNTU_VERSION"
    fi
    echo "Ubuntu version OK."
}

check_disk_space() {
    echo "Checking root partition disk space..."
    ROOT_AVAIL_GB=$(df -BG / | tail -1 | awk '{sub(/G$/,"",$4); print $4}')
    if [ "$ROOT_AVAIL_GB" -lt "$MIN_DISK_SPACE_GB" ]; then
      abort "At least ${MIN_DISK_SPACE_GB}G required, found ${ROOT_AVAIL_GB}G"
    fi
    echo "Sufficient disk space: ${ROOT_AVAIL_GB}G available."
}

check_internet() {
    echo "Testing internet connectivity (ping google.com)..."
    if ! ping -c 2 google.com >/dev/null 2>&1; then
      abort "Internet connectivity failed (cannot reach google.com)"
    fi
    echo "Internet connectivity OK."
}

create_provision_user() {
    echo "Creating provision user/group with UID/GID $PROVISION_UID ..."
    if ! getent group $PROVISION_GID >/dev/null; then
      addgroup --gid $PROVISION_GID $PROVISION_USER
    fi
    if ! id -u $PROVISION_USER >/dev/null 2>&1; then
      adduser --gecos "OpenCRVS Provisioning user" --disabled-password --uid $PROVISION_UID --gid $PROVISION_GID $PROVISION_USER
    fi
    usermod -aG sudo $PROVISION_USER
    if ! grep -q "^$PROVISION_USER " /etc/sudoers; then
      echo "$PROVISION_USER ALL=(ALL) NOPASSWD:ALL" | sudo tee -a /etc/sudoers
    fi
}

generate_ssh_key_for_user() {
    local user=$1
    local key_comment=$2
    local tmp_prefix="/tmp/${user}_ssh_key"
    sudo -u $user mkdir -p /home/$user/.ssh
    ssh-keygen -t rsa -b 4096 -f ${tmp_prefix} -N "" -C "${key_comment}@$(hostname)"
    cat ${tmp_prefix}.pub | sudo -u $user tee -a /home/$user/.ssh/authorized_keys > /dev/null
    chmod 600 /home/$user/.ssh/authorized_keys
    chown $user:$user /home/$user/.ssh/authorized_keys
    echo ""
    echo "----------------------"
    echo "PRIVATE SSH key for $user (save for GitHub/environment):"
    cat $tmp_prefix
    echo "----------------------"
    rm ${tmp_prefix}{,.pub}
}

prompt_and_add_pubkey_to_user() {
    local user=$1
    echo "Paste the PUBLIC SSH key from the manager node for 'provision' user, then press ENTER and CTRL+D:"
    sudo -u $user mkdir -p /home/$user/.ssh
    cat > /tmp/pubkey_input
    cat /tmp/pubkey_input | sudo -u $user tee -a /home/$user/.ssh/authorized_keys
    chmod 600 /home/$user/.ssh/authorized_keys
    chown $user:$user /home/$user/.ssh/authorized_keys
    rm /tmp/pubkey_input
    echo "Provision user's authorized_keys set for worker node."
}

create_backup_user() {
    echo "Creating backup user/group..."
    if ! id -u $BACKUP_USER >/dev/null 2>&1; then
      adduser --gecos "OpenCRVS Backup user" --disabled-password $BACKUP_USER
    fi
    usermod -aG sudo $BACKUP_USER
    if ! grep -q "^$BACKUP_USER " /etc/sudoers; then
      echo "$BACKUP_USER ALL=(ALL) NOPASSWD:ALL" | sudo tee -a /etc/sudoers
    fi
    generate_ssh_key_for_user $BACKUP_USER "backup"
}

# ---- MAIN ---- #

echo ""
echo "Initial OpenCRVS Node Bootstrap"
echo ""
echo "Select node type:"
PS3="Enter the number of the node type: "
NODE_TYPES=("single-node k8s cluster (dev/qa/staging)" "multi-node k8s cluster master" "multi-node k8s cluster worker" "backup server")
select NODE_TYPE in "${NODE_TYPES[@]}"; do
    case $REPLY in
        1)
            echo "Selected: single-node k8s cluster"
            NODE_KIND="single"
            break
            ;;
        2)
            echo "Selected: multi-node k8s cluster master"
            NODE_KIND="master"
            break
            ;;
        3)
            echo "Selected: multi-node k8s cluster worker"
            NODE_KIND="worker"
            break
            ;;
        4)
            echo "Selected: backup server"
            NODE_KIND="backup"
            break
            ;;
        *)
            echo "Invalid selection."
            ;;
    esac
done

echo "Running basic checks..."
check_ubuntu_version
check_disk_space
check_internet

if [ "$NODE_KIND" = "single" ] || [ "$NODE_KIND" = "master" ]; then
    create_provision_user
    generate_ssh_key_for_user $PROVISION_USER "provision"
    echo ""
    echo "Provision user setup complete. Save the private key above for GitHub Actions."
elif [ "$NODE_KIND" = "worker" ]; then
    create_provision_user
    prompt_and_add_pubkey_to_user $PROVISION_USER
    echo "Worker provision user ready."
elif [ "$NODE_KIND" = "backup" ]; then
    create_backup_user
    echo "Backup user created. Save the backup private key above for offsite access."
fi

echo ""
echo "Node bootstrap complete for $NODE_TYPE."
