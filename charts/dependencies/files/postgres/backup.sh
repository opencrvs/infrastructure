#!/usr/bin/env bash

# Databases backup list, space (" ") separated list, only events database needs to be backed up
DATABASES=${DATABASES:-"events"}
# Initial variables configuration
# Today's date is used for filenames if LABEL is not provided
BACKUP_DATE=$(date +%Y-%m-%d)
# Local directory inside container
BACKUP_DIR="/backups"
# Remote directory on backup server
REMOTE_DIR="${BACKUP_REMOTE_DIR:-"/home/$BACKUP_USER"}/$BACKUP_DATE"
# Temporal archive path inside container
ARCHIVE_PATH="/tmp/postgres_backup_${BACKUP_DATE}.dump"
# Remote directory on backup server
REMOTE_DIR="${BACKUP_REMOTE_DIR:-"/home/$BACKUP_USER"}/$BACKUP_DATE"

mkdir -p $BACKUP_DIR

# Install required software to transfer backup on remote host
apt-get update
apt-get install -y openssh-client rsync

backup(){
  # FIXME: Add for loop to iterate over databases
  echo "[$(date +%F\ %H:%M:%S)] Backing up PostgreSQL 'events' database"
  pg_dump -h $POSTGRES_HOST -U $POSTGRES_USER -d events -F c -f $ARCHIVE_PATH
  echo "[$(date +%F\ %H:%M:%S)] Backups completed: $BACKUP_DIR/*.gz"
}

create_encrypted_backup(){
  echo "[$(date +%F\ %H:%M:%S)] Encrypt backup at $ARCHIVE_PATH"
  # FIXME: Add for loop to iterate over databases
  openssl enc -aes-256-cbc -pbkdf2 -salt -in "$ARCHIVE_PATH" -out "${ARCHIVE_PATH}.enc" -pass env:ENCRYPT_PASS
  rm -f "$ARCHIVE_PATH"
  echo "[$(date +%F\ %H:%M:%S)] Backup encrypted at ${ARCHIVE_PATH}.enc"
}


transfer_to_backup_host(){
  echo "[$(date +%F\ %H:%M:%S)] Transfer backup to remote host"
if rsync -avz \
  --rsync-path="mkdir -p $REMOTE_DIR && rsync" \
  -e "ssh -i /ssh/ssh_key -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null" \
  "${ARCHIVE_PATH}.enc" "${BACKUP_USER}@${BACKUP_HOST}:${REMOTE_DIR}/"; then
  echo "[$(date +%F\ %H:%M:%S)] Encrypted backup file ${ARCHIVE_PATH}.enc transferred to backup host ${BACKUP_HOST}:${REMOTE_DIR}"
else
  echo "[$(date +%F\ %H:%M:%S)] [ERROR] Failed to transfer file ${ARCHIVE_PATH}.enc to backup host ${BACKUP_HOST}:${REMOTE_DIR}" >&2
  exit 1
fi
  
}

backup
create_encrypted_backup
transfer_to_backup_host