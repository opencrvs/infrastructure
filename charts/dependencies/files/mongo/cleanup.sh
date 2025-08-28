#!/usr/bin/env bash
DATABASES=${DATABASES:-"hearth-dev events user-mgnt application-config metrics webhooks performance"}
echo "Running cleanup"
if [ ! -z ${MONGODB_ADMIN_USER+x} ] && [ ! -z ${MONGODB_ADMIN_PASSWORD+x} ]; then
  AUTH="--username $MONGODB_ADMIN_USER --password $MONGODB_ADMIN_PASSWORD --authenticationDatabase admin";
else
  AUTH="";
fi
for DB in $DATABASES; do
  echo "Dropping database: $DB"
  mongo $AUTH --host $MONGODB_HOST --eval "db.getSiblingDB('$DB').dropDatabase()"
done
echo "Cleanup complete!"