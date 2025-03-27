
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
    echo 'Usage: ./clear-all-data.sh [-r REPLICAS] [-m MONGODB_HOST] [-e ELASTICSEARCH_HOST] [-n MINIO_HOST]'
    echo ""
    echo "Options:"
    echo "  -n NAMESPACE               Kubernetes namespace with deployed dependencies (default: opencrvs-deps-dev)"
    echo "  -o OPENCRVS_NAMESPACE      Kubernetes namespace with deployed OpenCRVS (default: opencrvs-dev)"
    echo "  -r REPLICAS                Number of MongoDB replicas"
    echo "  -m MONGODB_HOST            MongoDB host (default: mongo)"
    echo "  -e ELASTICSEARCH_HOST      Elasticsearch host (default: elasticsearch:9200)"
    echo "  -s MINIO_HOST              MinIO host (default: minio:3535)"
    echo "  -i INFLUX_HOST             InfluxDB host (default: influxdb)"
    echo ""
    echo "If your MongoDB is password protected, an admin user's credentials can be given as environment variables:"
    echo "MONGODB_ADMIN_USER=your_user MONGODB_ADMIN_PASSWORD=your_pass"
    echo ""
    echo "If your Elasticsearch is password protected, an admin user's credentials can be given as environment variables:"
    echo "ELASTICSEARCH_ADMIN_USER=your_user ELASTICSEARCH_ADMIN_PASSWORD=your_pass"
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
while getopts "n:o:r:m:e:s:i:" opt; do
    case $opt in
        n) NAMESPACE=$OPTARG ;;
        o) OPENCRVS_NAMESPACE=$OPTARG ;;
        r) REPLICAS=$OPTARG ;;
        m) MONGODB_HOST=$OPTARG ;;
        e) ELASTICSEARCH_HOST=$OPTARG ;;
        s) MINIO_HOST=$OPTARG ;;
        i) INFLUX_HOST=$OPTARG ;;
        *) print_usage_and_exit ;;
    esac
done

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
drop_database hearth-dev;

drop_database openhim-dev;

drop_database user-mgnt;

drop_database application-config;

drop_database metrics;

drop_database performance;

# Delete all data from elasticsearch
#-----------------------------------

indices=$(kubectl run elasticsearch-get-index-name --namespace $NAMESPACE --rm -i --image=appropriate/curl --restart=Never --command -- sh -c "curl -sS -XGET http://$(elasticsearch_host)/_cat/indices?h=index" | grep -v pod || true )
echo "--------------------------"
echo "🧹 cleanup for indices from $(elasticsearch_host): $indices"
echo "--------------------------"
for index in ${indices[@]}; do
  echo "Delete index $index..."
  kubectl run elasticsearch-get-index-name-`date +%s` --namespace $NAMESPACE --rm -i --image=appropriate/curl --restart=Never --command -- sh -c "curl -sS -XDELETE http://$(elasticsearch_host)/$index"
done


# Delete all data from metrics
#-----------------------------
echo "--------------------------"
echo "🧹 cleanup influxdb (metrics) databases on $INFLUX_HOST:"
echo "--------------------------"
kubectl run influxdb-drop-job --namespace $NAMESPACE --rm -i --image=appropriate/curl --restart=Never -- \
  curl -X POST http://$INFLUX_HOST:8086/query?db=ocrvs --data-urlencode "q=DROP SERIES FROM /.*/" -v

# Delete all data from minio
#-----------------------------
echo "--------------------------"
echo "🧹 cleanup MinIO storage on $MINIO_HOST:"
echo "--------------------------"
kubectl run minio-delete-job --namespace $NAMESPACE --rm -i --image=minio/mc --restart=Never --command -- sh -c "\
  mc alias set myminio http://$MINIO_HOST:3535 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD && \
  mc rm --recursive --force myminio/ocrvs && \
  mc rb myminio/ocrvs && \
  mc mb myminio/ocrvs"
echo "All data has been deleted"

# Restart the metabase and events services
#-----------------------------
kubectl delete pod --namespace $OPENCRVS_NAMESPACE -lapp=dashboards
kubectl delete pod --namespace $OPENCRVS_NAMESPACE -lapp=events
