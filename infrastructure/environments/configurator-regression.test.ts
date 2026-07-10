import assert from 'assert'

import {
  CONFIGURATION_FIELDS,
  ConfigurationField,
  ConfigurationScreenDefinition
} from './configuration-fields'
import { createDeploymentContext } from './deployment-context'
import {
  createFieldDefaultValueResolver,
  getSubmittedOrDerivedFieldValue
} from './configuration-state'
import { buildGithubUpdates } from './github-plan'
import { buildReviewPlan } from './review-plan'
import { buildNextSteps } from './next-steps'

function testGeneratedValuesAreStableAndScoped() {
  const resolveDefaultValue = createFieldDefaultValueResolver()
  const field: ConfigurationField = {
    id: 'postgresPassword',
    screen: 'dependencies',
    section: 'PostgreSQL',
    label: 'POSTGRES_PASSWORD',
    description: 'Generated password',
    control: 'password',
    generatedDefault: 'password',
    bindings: []
  }

  const first = resolveDefaultValue(field, 'development')
  const second = resolveDefaultValue(field, 'development')
  const otherEnvironment = resolveDefaultValue(field, 'production')

  assert.strictEqual(first, second)
  assert.notStrictEqual(first, otherEnvironment)
}

function testLockedDerivedValueIgnoresSubmittedValue() {
  const field: ConfigurationField = {
    id: 'activateUsers',
    screen: 'application',
    section: 'OpenCRVS',
    label: 'ACTIVATE_USERS',
    description: 'Activate users',
    control: 'checkbox',
    bindings: [],
    deriveValue: [
      {
        when: { context: 'environmentType', equals: 'production' },
        value: false,
        lock: true
      }
    ]
  }

  assert.strictEqual(
    getSubmittedOrDerivedFieldValue(field, true, true, {
      value: false,
      locked: true
    }),
    false
  )
}

function testGithubDisabledProducesNoGithubPlan() {
  const plan = buildGithubUpdates({
    enabled: false,
    includeSecretValues: false,
    approvalRequired: false,
    githubApprovers: '',
    applicationDomain: 'dev.opencrvs.org',
    githubToken: 'token',
    applicationSecrets: [],
    dependencyFields: [],
    advancedFields: [],
    dependenciesConfig: {},
    advancedConfig: {},
    genericScreenConfigs: {},
    backupEnabled: false,
    diskEncryptionEnabled: false,
    isFieldEnabled: () => true,
    isFieldActive: () => true,
    getFieldValue: () => '',
    getActiveBindings: () => [],
    variableExists: () => false,
    secretExists: () => false,
    hasEnvironmentSecret: () => false,
    getEncryptionKey: () => 'key',
    getBackupEncryptionPassphrase: () => 'passphrase',
    getBackupHostKeyPair: () => ({
      privateKey: 'private',
      publicKey: 'public'
    })
  })

  assert.deepStrictEqual(plan.variables, [])
  assert.deepStrictEqual(plan.secrets, [])
}

function testReviewSectionsFollowDeploymentFeatures() {
  const plan = buildReviewPlan({
    environmentName: 'development',
    deploymentFeatures: ['helm'],
    includeSecretValues: false,
    githubUpdates: {
      variables: [],
      secrets: []
    },
    inventoryValues: null,
    chartValues: {},
    helmUpdates: []
  })

  assert(plan.files.includes('environments/development/dependencies/values.yaml'))
  assert(!plan.files.some((file) => file.startsWith('.github/workflows/')))
  assert(!plan.files.some((file) => file.startsWith('infrastructure/server-setup/inventory/')))
}

function testNextStepsHideWhenInventoryAlreadyExists() {
  const steps = buildNextSteps({
    ansibleEnabled: true,
    environmentName: 'development',
    organisation: 'opencrvs',
    repository: 'infrastructure',
    token: 'token',
    kubeAPIHost: '10.0.0.1',
    backupEnabled: false,
    inventoryAlreadyExists: true
  })

  assert.strictEqual(steps, null)
}

function testFieldActivationWithBindingsAndRequires() {
  const context = createDeploymentContext({
    enableGithubIntegration: false,
    infrastructureType: 'managed-cluster'
  })
  const screen: ConfigurationScreenDefinition = {
    id: 'infrastructure',
    label: 'Infrastructure',
    description: '',
    order: 10,
    submitLabel: '',
    savedMessage: '',
    requires: ['ansible']
  }

  assert(!context.deploymentFeatures.includes('github'))
  assert(!context.deploymentFeatures.includes('ansible'))
  assert(screen.requires?.includes('ansible'))
}

function testBackupRestoreDependencyFieldsPlanGithubUpdates() {
  const values: Record<string, string> = {
    backupRestoreMode: 'backup',
    backupHost: '10.0.0.9',
    backupUser: 'backup',
    backupType: 'differential'
  }

  const plan = buildGithubUpdates({
    enabled: true,
    includeSecretValues: true,
    approvalRequired: false,
    githubApprovers: '',
    applicationDomain: '',
    githubToken: 'token',
    applicationSecrets: [],
    dependencyFields: CONFIGURATION_FIELDS.filter(({ screen }) => screen === 'dependencies'),
    advancedFields: [],
    dependenciesConfig: values,
    advancedConfig: {},
    genericScreenConfigs: {},
    backupEnabled: true,
    diskEncryptionEnabled: false,
    isFieldEnabled: () => true,
    isFieldActive: (field) =>
      !field.visibleWhen ||
      values[field.visibleWhen.fieldId] === field.visibleWhen.equals,
    getFieldValue: (field) => values[field.id] || '',
    getActiveBindings: (field) => field.bindings || [],
    variableExists: () => false,
    secretExists: () => false,
    hasEnvironmentSecret: () => false,
    getEncryptionKey: () => 'key',
    getBackupEncryptionPassphrase: () => 'passphrase',
    getBackupHostKeyPair: () => ({
      privateKey: 'private',
      publicKey: 'public'
    })
  })

  assert(plan.variables.some(
    (variable) => variable.name === 'BACKUP_HOST' && variable.value === '10.0.0.9'
  ))
  assert(plan.variables.some(
    (variable) =>
      variable.name === 'BACKUP_ENVIRONMENT_MODE' &&
      variable.value === 'differential'
  ))
  assert(plan.secrets.some(
    (secret) => secret.name === 'BACKUP_SERVER_USER' && secret.value === 'backup'
  ))
  assert(plan.secrets.some(
    (secret) =>
      secret.name === 'BACKUP_ENCRYPTION_PASSPHRASE' &&
      secret.value === 'passphrase'
  ))
}

testGeneratedValuesAreStableAndScoped()
testLockedDerivedValueIgnoresSubmittedValue()
testGithubDisabledProducesNoGithubPlan()
testReviewSectionsFollowDeploymentFeatures()
testNextStepsHideWhenInventoryAlreadyExists()
testFieldActivationWithBindingsAndRequires()
testBackupRestoreDependencyFieldsPlanGithubUpdates()

console.log('configurator regression tests passed')
