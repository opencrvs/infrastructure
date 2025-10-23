############################################################
# Tiltfile for OpenCRVS
############################################################
# ℹ️ Please check readme at: https://github.com/opencrvs/infrastructure/tree/develop
load('../infrastructure/tilt/opencrvs.tilt', 'setup_opencrvs')

############################################################
# ⚙ CONFIGURATION SECTION: User-defined Variables
############################################################
# NOTE: You could take any value from https://github.com/orgs/opencrvs/packages
# Be careful, because not all core + countryconfig images are compatible with each other,
# especially if you are using "develop" tag.
# Usually, official release images, e/g v1.9.0, are compatible with each other
# One of working combination is:
# - core: v1.9.0-beta-6
# - opencrvs/ocrvs-countryconfig: v1.9.0-beta-6

core_images_tag = "v1.9.0-beta-6"

# Countryconfig/Farajaland image repository and tag
# Usually image repository value (countryconfig_image_name) is your repository on DockerHub
# If for some reason you don't have DockerHub account yet, please create you local registry
# (see: https://medium.com/@ankitkumargupta/quick-start-local-docker-registry-35107038242e)
# If you would like to use Farajaland demo image, please use:
countryconfig_image_name="opencrvs/ocrvs-countryconfig"
# If you would like to start with sample countryconfig image, please use:
# countryconfig_image_name="opencrvs/ocrvs-countryconfig"
countryconfig_image_tag="v1.9.0-beta-6"

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
# Monitoring enabled:
# Enable Kibana and all other components
monitoring_enabled = False
# If your machine is powerful feel free to change parallel updates from default 3
# Be careful repositories like npm, yarn, pip, etc. could have rate limits
update_settings(max_parallel_updates=5)


############################################################
# Deploy workloads:
############################################################
setup_opencrvs(
    core_images_tag=core_images_tag,
    countryconfig_image_name=countryconfig_image_name,
    countryconfig_image_tag=countryconfig_image_tag,
    security_enabled=security_enabled,
    monitoring_enabled=monitoring_enabled,
)

print("✅ Tiltfile configuration loaded successfully.")
