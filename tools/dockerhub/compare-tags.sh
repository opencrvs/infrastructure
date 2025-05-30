#!/bin/bash

([ -z "$1" ] || [ -z "$2" ]) && echo "Usage: $0 <previous-tag> <current-tag>" && exit 1;

PREV_TAG=$1
CURRENT_TAG=$2

IMAGES=(
    opencrvs/ocrvs-base
    opencrvs/ocrvs-client
    opencrvs/ocrvs-dashboards
    opencrvs/ocrvs-login
    opencrvs/ocrvs-gateway
    opencrvs/ocrvs-events
    opencrvs/ocrvs-workflow
    opencrvs/ocrvs-search
    opencrvs/ocrvs-metrics
    opencrvs/ocrvs-scheduler
    opencrvs/ocrvs-auth
    opencrvs/ocrvs-user-mgnt
    opencrvs/ocrvs-webhooks
    opencrvs/ocrvs-notification
    opencrvs/ocrvs-config
    opencrvs/ocrvs-migration
    opencrvs/ocrvs-documents
)

for image in "${IMAGES[@]}";
do
    SIZE1=$(skopeo inspect docker://docker.io/${image}:${PREV_TAG} -n | jq '[.LayersData[].Size] | add / 1024 / 1024 | floor') || { SIZE1=0; echo "Not found"; continue; }
    SIZE2=$(skopeo inspect docker://docker.io/${image}:${CURRENT_TAG} -n | jq '[.LayersData[].Size] | add / 1024 / 1024 | floor') || {SIZE2=0; echo "Not found"; continue; }
    
    DIFF=$(( SIZE2 - SIZE1 ))
    if [ $DIFF -lt 0 ]; then
        DIFF_SIGN="👌"
    elif [ $DIFF -eq 0 ]; then
        DIFF_SIGN="✅"
    elif [ $DIFF -gt 0 ]; then
        if [ $DIFF -lt 10 ]; then
            DIFF_SIGN="✅"
        elif [ $DIFF -lt 50 ]; then
            DIFF_SIGN="⚠️";
        else
            DIFF_SIGN="❗️";
        fi
    fi

    echo "$DIFF_SIGN Comparing ${image}:  ${SIZE2}MB (${CURRENT_TAG}) - ${SIZE1}MB (${PREV_TAG}) = ${DIFF}MB"
done
