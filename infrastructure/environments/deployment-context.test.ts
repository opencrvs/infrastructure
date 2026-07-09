import assert from 'assert'

import {
  createDeploymentContext,
  getActiveFieldBindings,
  isFieldEnabledForDeployment,
  isScreenEnabled,
  normalizeInfrastructureType
} from './deployment-context'
import type { ConfigurationField, FieldBinding } from './configuration-fields'

function makeField(
  options: Pick<ConfigurationField, 'bindings'> &
    Partial<Pick<ConfigurationField, 'requires'>>
) {
  return options
}

const githubBinding: FieldBinding = {
  target: 'github',
  type: 'VARIABLE',
  scope: 'ENVIRONMENT',
  name: 'DOMAIN'
}

const helmBinding: FieldBinding = {
  target: 'helm',
  chart: 'opencrvs-services',
  path: 'hostname'
}

const ansibleBinding: FieldBinding = {
  target: 'ansible',
  name: 'kube_api_host'
}

const stateBinding: FieldBinding = {
  target: 'state',
  name: 'smtpEnabled'
}

const fullContext = createDeploymentContext({
  enableGithubIntegration: true,
  infrastructureType: 'on-premise'
})

const noGithubContext = createDeploymentContext({
  enableGithubIntegration: false,
  infrastructureType: 'on-premise'
})

const managedContext = createDeploymentContext({
  enableGithubIntegration: false,
  infrastructureType: 'managed-cluster'
})

assert.deepStrictEqual(fullContext.deploymentFeatures, [
  'github',
  'ansible',
  'helm'
])

assert.deepStrictEqual(managedContext.deploymentFeatures, ['helm'])

assert.strictEqual(normalizeInfrastructureType('cloud-native'), 'managed-cluster')
assert.strictEqual(
  normalizeInfrastructureType('existing-cluster'),
  'managed-cluster'
)
assert.strictEqual(
  normalizeInfrastructureType('managed-cluster'),
  'managed-cluster'
)
assert.strictEqual(normalizeInfrastructureType('unexpected'), 'on-premise')

assert.strictEqual(
  isScreenEnabled(managedContext, { requires: ['ansible'] }),
  false
)

assert.strictEqual(
  isFieldEnabledForDeployment(
    noGithubContext,
    makeField({ bindings: [githubBinding, helmBinding] })
  ),
  true
)

assert.deepStrictEqual(
  getActiveFieldBindings(
    noGithubContext,
    makeField({ bindings: [githubBinding, helmBinding] })
  ),
  [helmBinding]
)

assert.strictEqual(
  isFieldEnabledForDeployment(
    noGithubContext,
    makeField({ bindings: [githubBinding] })
  ),
  false
)

assert.strictEqual(
  isFieldEnabledForDeployment(
    fullContext,
    makeField({ requires: ['github'], bindings: [stateBinding] })
  ),
  true
)

assert.strictEqual(
  isFieldEnabledForDeployment(
    noGithubContext,
    makeField({ requires: ['github'], bindings: [stateBinding] })
  ),
  false
)

assert.strictEqual(
  isFieldEnabledForDeployment(managedContext, makeField({ bindings: [] })),
  true
)

assert.strictEqual(
  isFieldEnabledForDeployment(
    managedContext,
    makeField({ bindings: [ansibleBinding] })
  ),
  false
)

console.log('deployment-context tests passed')
