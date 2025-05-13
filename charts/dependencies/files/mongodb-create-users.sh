#!/bin/bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
#
# OpenCRVS is also distributed under the terms of the Civil Registration
# & Healthcare Disclaimer located at http://opencrvs.org/license.
#
# Copyright (C) The OpenCRVS Authors located at https://github.com/opencrvs/opencrvs-core/blob/master/AUTHORS.

# This file is run on each deployment with the sole purpose of updating
# passwords of MongoDB users to passwords given to this service as environment varibles

mongo_credentials() {
    if [ ! -z ${MONGODB_ADMIN_USER+x} ] || [ ! -z ${MONGODB_ADMIN_PASSWORD+x} ]; then
    echo "--username $MONGODB_ADMIN_USER --password $MONGODB_ADMIN_PASSWORD --authenticationDatabase admin";
    else
    echo "";
    fi
}
NAMESPACE=$(cat /var/run/secrets/kubernetes.io/serviceaccount/namespace)
echo NAMESPACE:$NAMESPACE
HOST="mongodb-0.mongodb.${NAMESPACE}.svc.cluster.local"
echo "Database: $HOST"
function checkIfUserExists {
    local user=$1
    local JSON="{\"user\": \"$user\"}"
    CMD='mongo admin --host $HOST $(mongo_credentials) --quiet --eval "db.getCollection(\"system.users\").find($JSON).length() > 0 ? \"FOUND\" : \"NOT_FOUND\""'
    eval $CMD
}

# Rotate passwords to match the ones given to this script or create new users
echo "==============================================================="
echo "Creating new users or updating passwords"
echo "==============================================================="
function update_credentials() {
db=$1
user=$2
password=$3
roles=`echo $4 | sed 's/"//g'`
if [ -z "$roles" ]
then
  roles="[{ role: 'readWrite', db: '$db' }]"
fi
echo "db: $db, user: $user, password: $password, roles: $roles"

user_exists=$(echo $(checkIfUserExists "$user"))
if [[ $user_exists != "FOUND" ]]; then
    echo "$user user not found"
    mongo $(mongo_credentials) --host $HOST <<EOF
    use $db
    db.createUser({
    user: '$user',
    pwd: '$password',
    roles: $roles
    })
EOF
else
    echo "$user user exists"
    mongo $(mongo_credentials) --host $HOST <<EOF
    use $db
    db.updateUser('$user', {
    pwd: '$password',
    roles: $roles
    })
EOF
fi
}

PREFIXES=( $(env | grep -oP "[A-Z_]+_MONGODB_USER" | sed 's/_MONGODB_USER//' | sort) )
echo "Prefixes: ${PREFIXES[@]}"
for prefix in ${PREFIXES[@]}
do
  db_var=${prefix}_MONGODB_DB
  db=${!db_var}
  password_var=${prefix}_MONGODB_PASSWORD
  password=${!password_var}
  user_var=${prefix}_MONGODB_USER
  user=${!user_var}
  roles_var=${prefix}_MONGODB_ROLES
  roles=${!roles_var}
  update_credentials $db $user $password "$roles"
done
