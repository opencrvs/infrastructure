# Tiltfile for OpenCRVS

############################################################
# ℹ️ Please check readme at: https://github.com/opencrvs/infrastructure/tree/develop
############################################################
# Load extensions for namespace and helm operations
load('ext://namespace', 'namespace_create', 'namespace_inject')
load("../infrastructure/tilt/lib.tilt", "copy_secrets", "reset_environment", "seed_data")
include('./tilt/common.tilt')

############################################################
# ⚙ CONFIGURATION SECTION: User-defined Variables
############################################################
# NOTE: You could take any value from https://github.com/orgs/opencrvs/packages
# Be careful, because not all core + countryconfig images are compatible with each other,
# especially if you are using "develop" tag.
# Usually, official release images, e/g v1.8.0, are compatible with each other
# One of working combination is:
# - core: da3ab7b
# - opencrvs/ocrvs-farajaland: efc9b7a

core_images_tag = "develop"

# Countryconfig/Farajaland image repository and tag
# Usually image repository value (countryconfig_image_name) is your repository on DockerHub
# If for some reason you don't have DockerHub account yet, please create you local registry
# (see: https://medium.com/@ankitkumargupta/quick-start-local-docker-registry-35107038242e)
# If you would like to use Farajaland demo image, please use:
countryconfig_image_name="opencrvs/ocrvs-farajaland"
# Mosip integration is hardcoded in the Farajaland demo image,
# Please also set mosip_enabled to True in the configuration file
mosip_enabled = True
# If you would like to start with sample countryconfig image, please use:
# countryconfig_image_name="opencrvs/ocrvs-countryconfig"
countryconfig_image_tag="develop"

# Namespaces:
# - opencrvs-deps-dev, dependencies namespace
dependencies_namespace = 'opencrvs-deps-dev'
# - opencrvs-dev, main namespace
opencrvs_namespace = 'opencrvs-dev'

# Security enabled:
# Configure security for dependencies and OpenCRVS services:
# - Setup MinIO admin user and password
# - Configure Redis users
# - Sync passwords between dependencies and OpenCRVS services
security_enabled = False

# If your machine is powerful feel free to change parallel updates from default 3
# Be careful repositories like npm, yarn, pip, etc. could have rate limits
update_settings(max_parallel_updates=5)


############################################################
# Deploy workloads:
############################################################

# Create namespaces:
namespace_create(dependencies_namespace)
namespace_create(opencrvs_namespace)

# Select configuration files for dependencies and OpenCRVS services
print("🔑 Deploying OpenCRVS and Dependencies in {} mode".format('Secure' if security_enabled else 'Non-secure'))
if not security_enabled:
  print("""  - Minio admin user/password: minioadmin/minioadmin
  - Authentication for Redis, MongoDB and Elasticsearch is disabled""")
if security_enabled:
    deps_configuration_file = './examples/localhost/dependencies/values-dev-secure.yaml'
    opencrvs_configuration_file = './examples/localhost/opencrvs-services/values-dev-secure.yaml'
else:
    deps_configuration_file = './examples/localhost/dependencies/values-dev.yaml'
    opencrvs_configuration_file = './examples/localhost/opencrvs-services/values-dev.yaml'

######################################################
# OpenCRVS Dependencies Deployment
print("🚀 Deploying dependencies: mongo, minio, elasticsearch...")
dependencies_chart_path = './charts/dependencies'
k8s_yaml(helm(dependencies_chart_path,
  namespace=dependencies_namespace,
  values=[deps_configuration_file]))

######################################################
# OpenCRVS Deployment
print("🚀 Deploying services: auth, events, gateway...")
opencrvs_chart_path = './charts/opencrvs-services'
opencrvs_values = [opencrvs_configuration_file]
if mosip_enabled:
    opencrvs_values.append('./examples/localhost/opencrvs-services/values-mosip.yaml')
k8s_yaml(
  helm(opencrvs_chart_path,
       namespace=opencrvs_namespace,
       values=opencrvs_values,
       set=[
        "image.tag={}".format(core_images_tag),
        "countryconfig.image.name={}".format(countryconfig_image_name),
        "countryconfig.image.tag={}".format(countryconfig_image_tag)
        ]
      )
)

if mosip_enabled:
    print("🚀 Deploying mosip services...")
    mosip_chart_path = './charts/opencrvs-mosip'
    k8s_yaml(
      helm(mosip_chart_path,
           namespace=opencrvs_namespace,
           values=[opencrvs_configuration_file])
    )

#######################################################
# Add Data Tasks to Tilt Dashboard
reset_environment(opencrvs_namespace, opencrvs_configuration_file)

seed_data(opencrvs_namespace, opencrvs_configuration_file)

if security_enabled:
    copy_secrets(dependencies_namespace, opencrvs_namespace)

print("✅ Tiltfile configuration loaded successfully.")
