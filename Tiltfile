############################################################
# Please check readme at: https://github.com/opencrvs/infrastructure/tree/develop
############################################################
# Load extensions for namespace and helm operations
load('ext://namespace', 'namespace_create', 'namespace_inject')
############################################################
# Variables declaration:
############################################################
# Core images tag: usually "develop" or one of release name:
# - v1.7.0
# - v1.7.1
# NOTE: It could take any value from https://github.com/orgs/opencrvs/packages
# If you are under opencrvs-core repository, please use "local" tag
# Tilt will build new image every time when changes are made to repository
core_images_tag="develop"

# Countryconfig/Farajaland image repository and tag
# Usually image repository value is to your repository on DockerHub
# If for some reason you don't have DockerHub account yet, please create
# you local registry
# (see: https://medium.com/@ankitkumargupta/quick-start-local-docker-registry-35107038242e)
countryconfig_image_name="opencrvs/ocrvs-countryconfig"
# If you are under opencrvs-countryconfig or your own repository, please use "local" tag,
# Tilt will build new image every time when changes are made to repository
countryconfig_image_tag="develop"

# Namespaces:
opencrvs_namespace = 'opencrvs-dev'
dependencies_namespace = 'opencrvs-deps-dev'

# Security enabled:
# Configure security for dependencies and OpenCRVS services:
# - Setup MinIO admin user and password
# - Configure Redis users
# - Sync passwords between dependencies and OpenCRVS services
security_enabled = False

############################################################
# What common Tiltfile does?
# - Group resources by label on UI: http://localhost:10350/
include('./tilt/common.tilt')

# If your machine is powerful feel free to change parallel updates from default 3
update_settings(max_parallel_updates=2)

############################################################
# Deploy workloads:
############################################################

# Create namespaces:
# - opencrvs-deps-dev, dependencies namespace
# - opencrvs-dev, main namespace
namespace_create(dependencies_namespace)
namespace_create(opencrvs_namespace)

if security_enabled:
    deps_configuration_file = './infrastructure/localhost/dependencies/values-dev-secure.yaml'
    opencrvs_configuration_file = './infrastructure/localhost/opencrvs-services/values-dev-secure.yaml'
else:
    deps_configuration_file = './infrastructure/localhost/dependencies/values-dev.yaml'
    opencrvs_configuration_file = './infrastructure/localhost/opencrvs-services/values-dev.yaml'
######################################################
# OpenCRVS Dependencies Deployment
# NOTE: This helm chart can be deployed as helm release
dependencies_chart_path = './charts/dependencies'
k8s_yaml(helm(dependencies_chart_path,
  namespace=dependencies_namespace,
  values=[deps_configuration_file]))

######################################################
# OpenCRVS Deployment
opencrvs_chart_path = './charts/opencrvs-services'
k8s_yaml(
  helm(opencrvs_chart_path,
       namespace=opencrvs_namespace,
       values=[opencrvs_configuration_file],
       set=[
        "image.tag={}".format(core_images_tag),
        "countryconfig.image.name={}".format(countryconfig_image_name),
        "countryconfig.image.tag={}".format(countryconfig_image_tag)
        ]
      )
)

load("../infrastructure/tilt/common.tilt", "copy_secrets", "reset_environment")
reset_environment(
    opencrvs_namespace,
    opencrvs_configuration_file
)

if security_enabled:
    copy_secrets(opencrvs_namespace, dependencies_namespace)
