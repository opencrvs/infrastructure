IMAGES=(
    opencrvs/ocrvs-base
    opencrvs/ocrvs-client
    opencrvs/ocrvs-dashboards
    opencrvs/ocrvs-login
    opencrvs/ocrvs-gateway
    opencrvs/ocrvs-events
    opencrvs/ocrvs-metrics
    opencrvs/ocrvs-auth
    opencrvs/ocrvs-user-mgnt
    opencrvs/ocrvs-webhooks
    opencrvs/ocrvs-notification
    opencrvs/ocrvs-migration
    opencrvs/ocrvs-documents
)


VERSION="v1.9.12"

for IMAGE in "${IMAGES[@]}"; do
    echo "Pulling $IMAGE from Docker Hub..."
    docker pull "ghcr.io/$IMAGE:$VERSION"
    DST_IMAGE="${IMAGE/ocrvs/priv-ocrvs}:$VERSION"
    docker tag "ghcr.io/$IMAGE:$VERSION" "$DST_IMAGE"

    docker push "$DST_IMAGE"
    # exit 0
done