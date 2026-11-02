#!/bin/bash
###########################################################################
# This script is used to convert OpenCRVS backup made by OS cronjob (docker swarm)
# into a format that can be used by the Kubernetes cronjob.
# NOTE: USE THIS SCRIPT WITH CAUTION
# HOW TO USE:
# 1. Put the script in the backup user home directory (e.g. /home/backup)
# 2. Set the following environment variables:
#    - PASSPHRASE: The passphrase used to encrypt the backup file.
#    - LABEL: The label of the backup in the format YYYY-MM-DD.
#    - SWARM_BACKUP_ENC_FILE: The full path to the encrypted backup file
#    - K8S_BACKUP_DIR: (Optional) The directory where the converted backup files will be stored. 
#      Default is /home/backup/k8s-backup. Please adjust to your Kubernetes cronjob backup directory.
#    - WORK_DIR_BASE: (Optional) The directory where a private temporary working directory is created
#      for the decrypted data. It needs enough free space for the decrypted and extracted backup.
#      Default is the directory of SWARM_BACKUP_ENC_FILE. The working directory is always removed on exit.
# 3. Run the script from backup user home directory: ./convert-backup.sh
#
# The decrypted backup contains citizen data. All decrypted and extracted data
# is kept in a private (0700) temporary directory that is removed when the script
# exits, whether it succeeds or fails. Only encrypted files are left behind.
###########################################################################

set -euo pipefail
# Files created by this script must only be readable by the current user
umask 077

##################################
# Required variables
: "${PASSPHRASE:?Must set PASSPHRASE}"
: "${LABEL:?Must set LABEL in format YYYY-MM-DD}"
: "${SWARM_BACKUP_ENC_FILE:?Set full path to encrypted file variable SWARM_BACKUP_ENC_FILE}"
##################################

##################################
# Optional variables
K8S_BACKUP_DIR=${K8S_BACKUP_DIR-/home/backup/k8s-backup}
WORK_DIR_BASE=${WORK_DIR_BASE-$(dirname "$SWARM_BACKUP_ENC_FILE")}
##################################

# The passphrase is passed to openssl through the environment (-pass env:PASSPHRASE)
# instead of the command line, where it would be visible to other users in ps.
export PASSPHRASE

NEW_BACKUP_DIR="${K8S_BACKUP_DIR}/${LABEL}"
# SWARM_BACKUP_ENC_FILE="${LABEL}.tar.gz.enc"

# All plaintext data is kept in a private working directory that is always removed on exit
WORK_DIR="$(mktemp -d "${WORK_DIR_BASE}/convert-backup.XXXXXX")"
trap 'rm -rf "$WORK_DIR"' EXIT
trap 'exit 1' INT TERM HUP

SWARM_BACKUP_FILE="${WORK_DIR}/$(basename "${SWARM_BACKUP_ENC_FILE%.enc}")"
EXTRACT_DIR="${WORK_DIR}/extract"

echo "Decrypting $SWARM_BACKUP_ENC_FILE to temporary directory $WORK_DIR"
openssl enc -d \
  -aes-256-cbc \
  -salt \
  -pbkdf2 \
  -in "$SWARM_BACKUP_ENC_FILE" \
  -out "$SWARM_BACKUP_FILE" \
  -pass env:PASSPHRASE
mkdir -p "$EXTRACT_DIR"

echo "Extracting archive $SWARM_BACKUP_FILE to $EXTRACT_DIR"
tar -xzf "$SWARM_BACKUP_FILE" -C "$EXTRACT_DIR"
rm -f "$SWARM_BACKUP_FILE"
echo "Remove elasticsearch directory"
rm -rf "$EXTRACT_DIR/elasticsearch"

echo "Package influxdb"
tar -czf "$WORK_DIR/influxdb_backup_${LABEL}.tar.gz" \
    -C "$EXTRACT_DIR/influxdb" \
    .
echo "Package minio"
echo "1. Extracting ocrvs-${LABEL}.tar.gz from $EXTRACT_DIR/minio"
mkdir "$EXTRACT_DIR/minio-tmp"
tar xf "$EXTRACT_DIR/minio/ocrvs-${LABEL}.tar.gz" -C "$EXTRACT_DIR/minio-tmp"
echo "2. Packaging minio"
tar -czf "$WORK_DIR/minio_backup_${LABEL}.tar.gz" \
    -C "$EXTRACT_DIR/minio-tmp" \
    .
echo "Package mongo"
echo "1. Rename extracted mongo database files to remove the label suffix"
for DB in $(ls -1 "$EXTRACT_DIR/mongo"); do
    NEW_ARCHIVE_NAME="${DB/-${LABEL}/}"
    echo "- $DB -> ${NEW_ARCHIVE_NAME}"
    if [ "$DB" != "$NEW_ARCHIVE_NAME" ]; then
        mv "$EXTRACT_DIR/mongo/$DB" "$EXTRACT_DIR/mongo/${NEW_ARCHIVE_NAME}"
    fi
done
echo "2. Packaging mongo"
tar -czf "$WORK_DIR/mongo_backup_${LABEL}.tar.gz" \
    -C "$EXTRACT_DIR/mongo" \
    .
mkdir -p "$NEW_BACKUP_DIR"
for BACKUP_FILE in "influxdb_backup_${LABEL}.tar.gz" "minio_backup_${LABEL}.tar.gz" "mongo_backup_${LABEL}.tar.gz"; do
    echo "Encrypting $BACKUP_FILE"
    openssl enc -aes-256-cbc -salt -pbkdf2 \
      -in "${WORK_DIR}/${BACKUP_FILE}" \
      -out "${WORK_DIR}/${BACKUP_FILE}.enc" \
      -pass env:PASSPHRASE
    # Remove the unencrypted archive as soon as it has been encrypted
    rm -f "${WORK_DIR}/${BACKUP_FILE}"
    echo "Moving $BACKUP_FILE.enc to $NEW_BACKUP_DIR"
    mv "${WORK_DIR}/${BACKUP_FILE}.enc" "$NEW_BACKUP_DIR"
done
