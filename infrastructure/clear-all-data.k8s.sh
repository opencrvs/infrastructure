#!/bin/bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
#
# OpenCRVS is also distributed under the terms of the Civil Registration
# & Healthcare Disclaimer located at http://opencrvs.org/license.
#
# Copyright (C) The OpenCRVS Authors located at https://github.com/opencrvs/opencrvs-core/blob/master/AUTHORS.

set -e

print_usage_and_exit () {
echo """
Usage: ./clear-all-data.sh [--dependencies-namespace NAMESPACE] [--opencrvs-namespace OPENCRVS_NAMESPACE] [--replicas REPLICAS] [--mongodb-host MONGODB_HOST] [--elasticsearch-host ELASTICSEARCH_HOST] [--minio-host MINIO_HOST]

Options:
  -n, --dependencies-namespace  Kubernetes namespace with deployed dependencies (default: opencrvs-deps-dev)
  -o, --opencrvs-namespace      Kubernetes namespace with deployed OpenCRVS (default: opencrvs-dev)
  -r, --replicas                Number of MongoDB replicas
  -m, --mongodb-host            MongoDB host (default: mongo)
  -e, --elasticsearch-host      Elasticsearch host (default: elasticsearch:9200)
  -s, --minio-host              MinIO host (default: minio:3535)
  -i, --influx-host             InfluxDB host (default: influxdb)
  -b, --migration-image-tag     Migration image tag (default: develop)
  -c, --dataseed-image-tag      Data seeder image tag (default: develop)
  -t, --targets                 Comma separated list of targets to run (default: all), avalable options: clean,migrate,seed

If your MongoDB is password protected, an admin user's credentials can be given as environment variables:
MONGODB_ADMIN_USER=your_user MONGODB_ADMIN_PASSWORD=your_pass

If your Elasticsearch is password protected, an admin user's credentials can be given as environment variables:
ELASTICSEARCH_ADMIN_USER=your_user ELASTICSEARCH_ADMIN_PASSWORD=your_pass
"""
exit 1
}

# Default values
REPLICAS="0"
NAMESPACE="opencrvs-deps-dev"
OPENCRVS_NAMESPACE="opencrvs-dev"
MONGODB_HOST="mongodb"
ELASTICSEARCH_HOST="elasticsearch"
MINIO_HOST="minio"
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
INFLUX_HOST="influxdb"
MIGRATION_IMAGE_TAG="develop"
DATASEED_IMAGE_TAG="develop"
TARGET="clean,migrate,seed"

while [[ "$#" -gt 0 ]]; do
case $1 in
-n|--dependencies-namespace)
  NAMESPACE="$2"; shift 2 ;;
-o|--opencrvs-namespace)
  OPENCRVS_NAMESPACE="$2"; shift 2 ;;
-r|--replicas)
  REPLICAS="$2"; shift 2 ;;
-m|--mongodb-host)
  MONGODB_HOST="$2"; shift 2 ;;
-e|--elasticsearch-host)
  ELASTICSEARCH_HOST="$2"; shift 2 ;;
-s|--minio-host)
  MINIO_HOST="$2"; shift 2 ;;
-i|--influx-host)
  INFLUX_HOST="$2"; shift 2 ;;
-b|--migration-image-tag)
  MIGRATION_IMAGE_TAG="$2"; shift 2 ;;
-c|--dataseed-image-tag)
  DATASEED_IMAGE_TAG="$2"; shift 2 ;;
-t|--targets)
  TARGETS="$2";
  [ "$TARGETS" == "all" ] && TARGETS="clean,migrate,seed"
  shift 2;;
-h|*)
print_usage_and_exit ;;
esac
done

echo "================= 🧹 🧹 🧹 Cleaning database 🧹 🧹 🧹 ================="

if ! [[ "$REPLICAS" =~ ^[0-9]+$ ]]; then
  echo "'Error: Script must be passed a positive integer number of replicas. Got '$REPLICAS'"
  print_usage_and_exit
fi

if [ "$REPLICAS" = "0" ]; then
  HOST=$MONGODB_HOST
  echo "Working with no replicas"
else
  # TODO: THIS PART IS NOT TESTED YET
  # Construct the HOST string rs0/mongo1,mongo2... based on the number of replicas
  HOST=""
  for (( i=1; i<=REPLICAS; i++ )); do
    if [ $i -gt 1 ]; then
      HOST="${HOST},"
    fi
    HOST="${HOST}mongo${i}"
  done
fi

mongo_credentials() {
  if [ ! -z ${MONGODB_ADMIN_USER+x} ] || [ ! -z ${MONGODB_ADMIN_PASSWORD+x} ]; then
    echo "--username $MONGODB_ADMIN_USER --password $MONGODB_ADMIN_PASSWORD --authenticationDatabase admin";
  else
    echo "";
  fi
}

elasticsearch_host() {
  if [ ! -z ${ELASTICSEARCH_ADMIN_USER+x} ] || [ ! -z ${ELASTICSEARCH_ADMIN_PASSWORD+x} ]; then
    echo "$ELASTICSEARCH_ADMIN_USER:$ELASTICSEARCH_ADMIN_PASSWORD@$ELASTICSEARCH_HOST:9200";
  else
    echo "$ELASTICSEARCH_HOST:9200";
  fi
}

drop_database () {
    local database=${1}
    kubectl run mongo-drop-job --namespace $NAMESPACE --rm -i --image=mongo:4.4 --restart=Never -- \
        mongo $database $(mongo_credentials) --host $HOST --eval "db.dropDatabase()"
}

# Delete all data from mongo
#---------------------------
echo "--------------------------"
echo "🧹 cleanup mongo databases on $HOST:"
echo "--------------------------"

MONGO_STATUS_CNT=0

drop_database hearth-dev || ((MONGO_STATUS_CNT++));

drop_database openhim-dev || ((MONGO_STATUS_CNT++));

drop_database user-mgnt || ((MONGO_STATUS_CNT++));

drop_database application-config || ((MONGO_STATUS_CNT++));

drop_database metrics || ((MONGO_STATUS_CNT++));

drop_database performance || ((MONGO_STATUS_CNT++));

[ $MONGO_STATUS_CNT -eq 0 ] && MONGO_CLEANUP=✅ || MONGO_CLEANUP=❌

# Delete all data from elasticsearch
#-----------------------------------
ES_STATUS_CNT=0
indices=$(kubectl run elasticsearch-get-index-name --namespace $NAMESPACE --rm -i --image=appropriate/curl --restart=Never --command -- sh -c "curl -sS -XGET http://$(elasticsearch_host)/_cat/indices?h=index" | grep -v pod || true )
echo "--------------------------"
echo "🧹 cleanup for indices from $(elasticsearch_host): $indices"
echo "--------------------------"
for index in ${indices[@]}; do
  echo "Delete index $index..."
  kubectl run elasticsearch-get-index-name-`date +%s` --namespace $NAMESPACE --rm -i --image=appropriate/curl --restart=Never --command -- sh -c "curl -sS -XDELETE http://$(elasticsearch_host)/$index"
done

[ $ES_STATUS_CNT -eq 0 ] && ES_CLEANUP=✅ || ES_CLEANUP=❌

# Delete all data from metrics
#-----------------------------
echo "--------------------------"
echo "🧹 cleanup influxdb (metrics) databases on $INFLUX_HOST:"
echo "--------------------------"
kubectl run influxdb-drop-job --namespace $NAMESPACE --rm -i --image=appropriate/curl --restart=Never -- \
  curl -X POST http://$INFLUX_HOST:8086/query?db=ocrvs --data-urlencode "q=DROP SERIES FROM /.*/" -v  && INFLUX_CLEANUP=✅ || INFLUX_CLEANUP=❌

# Delete all data from minio
#-----------------------------
echo "--------------------------"
echo "🧹 cleanup MinIO storage on $MINIO_HOST:"
echo "--------------------------"
kubectl run minio-delete-job --namespace $NAMESPACE --rm -i --image=minio/mc --restart=Never --command -- sh -c "\
  mc alias set myminio http://$MINIO_HOST:3535 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD && \
  mc rm --recursive --force myminio/ocrvs && \
  mc rb myminio/ocrvs && \
  mc mb myminio/ocrvs" && MINIO_CLEANUP=✅ || MINIO_CLEANUP=❌
echo "All data has been deleted"

# Restart events by deleting pod
#-----------------------------
kubectl delete pod --namespace $OPENCRVS_NAMESPACE -lapp=events && EVENTS_RESTART=✅ || EVENTS_RESTART=❌

# Run migration
echo "================= 🕐 🕝 🕐 Running migration 🕐 🕝 🕐 ================="
kubectl run migration-db-job --namespace $NAMESPACE \
--rm -i --image=ghcr.io/opencrvs/ocrvs-migration:develop \
--env="ES_HOST=$(elasticsearch_host)" \
--env="SEARCH_URL=http://search.${OPENCRVS_NAMESPACE}.svc.cluster.local:9090/" \
--env="INFLUX_DB=ocrvs" \
--env="INFLUX_HOST=$INFLUX_HOST" \
--env="INFLUX_PORT=8086" \
--env="MINIO_HOST=$MINIO_HOST" \
--env="APPLICATION_CONFIG_MONGO_URL=mongodb://$HOST/application-config" \
--env="USER_MGNT_MONGO_URL=mongodb://$HOST/user-mgnt" \
--env="PERFORMANCE_MONGO_URL=mongodb://$HOST/performance" \
--env="HEARTH_MONGO_URL=mongodb://$HOST/hearth-dev" \
--env="OPENHIM_MONGO_URL=mongodb://$HOST/openhim-dev" \
--env="DASHBOARD_MONGO_URL=mongodb://$HOST/performance" \
--env="WAIT_HOSTS=$HOST:27017,$INFLUX_HOST:8086,$MINIO_HOST:3535,$ELASTICSEARCH_HOST:9200" \
--env="MINIO_BUCKET=ocrvs" \
--env="NODE_ENV=production" && MIGRATION_JOB=✅ || MIGRATION_JOB=❌

echo "================= 🌱 🌱 🌱 Running data seeding 🌱 🌱 🌱 ================="
kubectl run data-seeder-db-job --namespace $NAMESPACE --rm -i \
--image=ghcr.io/opencrvs/ocrvs-data-seeder:develop \
--env="AUTH_HOST=http://auth.opencrvs-dev.svc.cluster.local:4040" \
--env="GATEWAY_HOST=http://gateway.opencrvs-dev.svc.cluster.local:7070" \
--env="COUNTRY_CONFIG_HOST=http://countryconfig.opencrvs-dev.svc.cluster.local:3040" \
--env="MINIO_BUCKET=ocrvs" \
--env="NODE_ENV=production" \
--env="ACTIVATE_USERS=true" \
--env="SUPER_USER_PASSWORD=password" && DATA_SEED_JOB=✅ || DATA_SEED_JOB=❌


echo """
------------------------------------------------------------------
Overall Cleanup status:
------------------------------------------------------------------
Cleanup:
  - Mongo DB cleanup $MONGO_CLEANUP
  - Elasticsearch index cleanup $ES_CLEANUP
  - Minio cleanup $MINIO_CLEANUP
  - Influx DB cleaup $INFLUX_CLEANUP
  - Events restart $EVENTS_RESTART
Database migration $MIGRATION_JOB
Data seeding $DATA_SEED_JOB
------------------------------------------------------------------
"""
