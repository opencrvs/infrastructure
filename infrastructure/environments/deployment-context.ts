import type {
  ConfigurationField,
  DeploymentFeature,
  FieldBinding
} from './configuration-fields'

export type InfrastructureType =
  | 'on-premise'
  | 'managed-cluster'
  | 'cloud-native'
  | 'existing-cluster'

export type NormalizedInfrastructureType = 'on-premise' | 'managed-cluster'

export type SetupOptions = {
  enableGithubIntegration: boolean
  infrastructureType: NormalizedInfrastructureType
}

export type DeploymentContext = {
  setupOptions: SetupOptions
  deploymentFeatures: DeploymentFeature[]
}

export function normalizeInfrastructureType(
  value: unknown
): NormalizedInfrastructureType {
  if (value === 'cloud-native' || value === 'existing-cluster') {
    return 'managed-cluster'
  }

  return value === 'managed-cluster' ? 'managed-cluster' : 'on-premise'
}

export function createDeploymentContext(
  setupOptions: SetupOptions
): DeploymentContext {
  const deploymentFeatures: DeploymentFeature[] = [
    setupOptions.enableGithubIntegration ? 'github' : null,
    setupOptions.infrastructureType === 'on-premise' ? 'ansible' : null,
    'helm'
  ].filter((feature): feature is DeploymentFeature => Boolean(feature))

  return {
    setupOptions,
    deploymentFeatures
  }
}

export function hasDeploymentFeature(
  context: DeploymentContext,
  feature: DeploymentFeature
) {
  return context.deploymentFeatures.includes(feature)
}

function getBindingFeature(binding: { target: string }): DeploymentFeature | null {
  if (
    binding.target === 'github' ||
    binding.target === 'helm' ||
    binding.target === 'ansible'
  ) {
    return binding.target
  }

  return null
}

export function isBindingEnabled(
  context: DeploymentContext,
  binding: { target: string }
) {
  const feature = getBindingFeature(binding)
  return feature ? hasDeploymentFeature(context, feature) : true
}

export function isScreenEnabled(
  context: DeploymentContext,
  definition: { requires?: DeploymentFeature[] }
) {
  return !definition.requires?.length ||
    definition.requires.some((feature) => hasDeploymentFeature(context, feature))
}

function isRequiresEnabled(
  context: DeploymentContext,
  requires?: DeploymentFeature[]
) {
  return Boolean(
    requires?.length &&
      requires.some((feature) => hasDeploymentFeature(context, feature))
  )
}

export function isFieldEnabledForDeployment(
  context: DeploymentContext,
  field: Pick<ConfigurationField, 'bindings' | 'requires'>
) {
  const hasRequires = Boolean(field.requires?.length)
  const hasBindings = field.bindings.length > 0

  if (!hasRequires && !hasBindings) {
    return true
  }

  return (
    isRequiresEnabled(context, field.requires) ||
    field.bindings.some((binding) => isBindingEnabled(context, binding))
  )
}

export function getActiveFieldBindings<TBinding extends FieldBinding>(
  context: DeploymentContext,
  field: { bindings: TBinding[] }
) {
  return field.bindings.filter((binding) => isBindingEnabled(context, binding))
}

export function getFieldForCurrentDeployment<TField extends ConfigurationField>(
  context: DeploymentContext,
  field: TField
) {
  return {
    ...field,
    bindings: getActiveFieldBindings(context, field)
  }
}
