# Reduce number of hardcoded variables

CERT_PUBLIC_KEY_PATH is common for almost all services

Few examples of common variables:
COUNTRY_CONFIG_URL
USER_MANAGEMENT_URL
COUNTRY_CONFIG_URL_INTERNAL

Variable with mutations: MONGO_URL


# Publish helm charts

We are starting development, but helm charts already exist and once we setup server environment there will be need to have repository.

# Add github workflows for kubernetes

1. Add workflow for kubernetes deployment
   - github actions
   - helm deployment
2. Add workflow for kubernetes data seed
   - check if it's possible to build post-deploy job for opencrvs-services chart
3. Add workflow for creating users in ELK and mongo
   - check if it's possible to build post-deploy job for dependencies chart
# Monitoring

1. Review option of replacing ELK with something more simple

# SSL

Automatically issue SSL secret for traefix, check possibility to issue valid SSL certificate. Cloud Flare allows to use domain validation for SSL. It is possible to issue valid SSL for dev environment and then use Certificate across all dev environments within local.opencrvs.dev domain.

# Fixes

1. Fix events
2. Fix clients:
   - [16:11:44.470] ERROR: Failed to connect to MongoDB. Retrying...
   - HTTP 500 https://config.opencrvs.localhost/publicConfig