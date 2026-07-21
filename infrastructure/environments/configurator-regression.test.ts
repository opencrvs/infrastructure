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
import { buildInventoryValues } from './ansible-plan'

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
    environmentExists: false,
    includeSecretValues: false,
    approvalRequired: false,
    githubApprovers: '',
    applicationDomain: 'dev.opencrvs.org',
    githubToken: 'token',
    fields: [],
    backupEnabled: false,
    diskEncryptionEnabled: false,
    isFieldEnabled: () => true,
    isFieldActive: () => true,
    getFieldValue: () => '',
    getActiveBindings: () => [],
    getVariableValue: () => '',
    variableExists: () => false,
    secretExists: () => false,
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
    environmentExists: false,
    includeSecretValues: true,
    approvalRequired: false,
    githubApprovers: '',
    applicationDomain: '',
    githubToken: 'token',
    fields: CONFIGURATION_FIELDS.filter(({ screen }) => screen === 'dependencies'),
    backupEnabled: true,
    diskEncryptionEnabled: false,
    isFieldEnabled: () => true,
    isFieldActive: (field) =>
      !field.visibleWhen ||
      values[field.visibleWhen.fieldId] === field.visibleWhen.equals,
    getFieldValue: (field) => values[field.id] || '',
    getActiveBindings: (field) => field.bindings || [],
    getVariableValue: () => '',
    variableExists: () => false,
    secretExists: () => false,
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

function testUnchangedGithubVariablesAreNotUpdated() {
  const plan = buildGithubUpdates({
    enabled: true,
    environmentExists: false,
    includeSecretValues: false,
    approvalRequired: true,
    githubApprovers: '',
    applicationDomain: '',
    githubToken: '',
    fields: [],
    backupEnabled: false,
    diskEncryptionEnabled: false,
    isFieldEnabled: () => true,
    isFieldActive: () => true,
    getFieldValue: () => '',
    getActiveBindings: () => [],
    getVariableValue: (_scope, name) =>
      name === 'APPROVAL_REQUIRED' ? 'true' : '',
    variableExists: (_scope, name) => name === 'APPROVAL_REQUIRED',
    secretExists: () => false,
    getEncryptionKey: () => 'key',
    getBackupEncryptionPassphrase: () => 'passphrase',
    getBackupHostKeyPair: () => ({
      privateKey: 'private',
      publicKey: 'public'
    })
  })

  assert.strictEqual(
    plan.variables.find(({ name }) => name === 'APPROVAL_REQUIRED')?.action,
    'unchanged'
  )
}

function testHiddenGeneratedSecretIsOnlyCreatedForNewEnvironment() {
  const field = CONFIGURATION_FIELDS.find(({ id }) => id === 'superUserPassword')
  assert(field)
  assert.strictEqual(field.hidden, true)

  const baseInput = {
    enabled: true,
    includeSecretValues: true,
    approvalRequired: false,
    githubApprovers: '',
    applicationDomain: '',
    githubToken: '',
    fields: [field],
    backupEnabled: false,
    diskEncryptionEnabled: false,
    isFieldEnabled: () => true,
    isFieldActive: () => true,
    getFieldValue: () => 'generated-super-user-password',
    getActiveBindings: (configurationField: ConfigurationField) =>
      configurationField.bindings || [],
    getVariableValue: () => '',
    variableExists: () => false,
    secretExists: () => false,
    getEncryptionKey: () => 'key',
    getBackupEncryptionPassphrase: () => 'passphrase',
    getBackupHostKeyPair: () => ({
      privateKey: 'private',
      publicKey: 'public'
    })
  }

  const newEnvironmentPlan = buildGithubUpdates({
    ...baseInput,
    environmentExists: false
  })
  const existingEnvironmentPlan = buildGithubUpdates({
    ...baseInput,
    environmentExists: true
  })

  assert(newEnvironmentPlan.secrets.some(
    (secret) =>
      secret.name === 'SUPER_USER_PASSWORD' &&
      secret.value === 'generated-super-user-password' &&
      secret.action === 'create'
  ))
  assert(!existingEnvironmentPlan.secrets.some(
    (secret) => secret.name === 'SUPER_USER_PASSWORD'
  ))
}

function testHiddenSecretsAreExcludedFromReviewPlan() {
  const plan = buildReviewPlan({
    environmentName: 'development',
    deploymentFeatures: ['github'],
    includeSecretValues: false,
    githubUpdates: {
      variables: [],
      secrets: [
        {
          scope: 'ENVIRONMENT',
          type: 'SECRET',
          name: 'SUPER_USER_PASSWORD',
          value: '[generated on finalize]',
          exists: false,
          action: 'create',
          hidden: true
        },
        {
          scope: 'ENVIRONMENT',
          type: 'SECRET',
          name: 'VISIBLE_SECRET',
          value: '[provided on submit]',
          exists: false,
          action: 'create'
        }
      ]
    },
    inventoryValues: null,
    chartValues: null,
    helmUpdates: []
  })

  assert(!plan.secrets.some((secret) => secret.name === 'SUPER_USER_PASSWORD'))
  assert(plan.secrets.some((secret) => secret.name === 'VISIBLE_SECRET'))
}

function testDefaultUserPasswordIsOmittedWhenSmtpEnabled() {
  const field = CONFIGURATION_FIELDS.find(({ id }) => id === 'defaultUserPassword')
  assert(field)
  assert(field.deriveValue?.some(
    (rule) =>
      'fieldId' in rule.when &&
      rule.when.fieldId === 'smtpEnabled' &&
      rule.when.equals === true &&
      rule.value === ''
  ))

  const baseInput = {
    enabled: true,
    environmentExists: false,
    includeSecretValues: true,
    approvalRequired: false,
    githubApprovers: '',
    applicationDomain: '',
    githubToken: '',
    fields: [field],
    backupEnabled: false,
    diskEncryptionEnabled: false,
    isFieldEnabled: () => true,
    isFieldActive: () => true,
    getActiveBindings: (configurationField: ConfigurationField) =>
      configurationField.bindings || [],
    getVariableValue: () => '',
    variableExists: () => false,
    secretExists: () => false,
    getEncryptionKey: () => 'key',
    getBackupEncryptionPassphrase: () => 'passphrase',
    getBackupHostKeyPair: () => ({
      privateKey: 'private',
      publicKey: 'public'
    })
  }

  const smtpDisabledPlan = buildGithubUpdates({
    ...baseInput,
    getFieldValue: () => 'generated-default-password'
  })
  const smtpEnabledPlan = buildGithubUpdates({
    ...baseInput,
    getFieldValue: () => ''
  })

  assert(smtpDisabledPlan.variables.some(
    (variable) =>
      variable.name === 'DEFAULT_USER_PASSWORD' &&
      variable.value === 'generated-default-password'
  ))
  assert(!smtpEnabledPlan.variables.some(
    (variable) => variable.name === 'DEFAULT_USER_PASSWORD'
  ))
}

function testInventoryValuesFollowAnsibleBindings() {
  const values = buildInventoryValues({
    fields: CONFIGURATION_FIELDS.filter((field) =>
      field.bindings.some((binding) => binding.target === 'ansible')
    ),
    values: {
      kubeAPIHost: '10.0.0.1',
      kubeWorkerNodes: '10.0.0.2, 10.0.0.3',
      backupHost: '10.0.0.9'
    },
    customValues: {
      users: [
        {
          name: 'admin',
          ssh_keys: ['ssh-ed25519 test'],
          state: 'present',
          role: 'admin'
        }
      ]
    }
  })

  assert.strictEqual(values.kube_api_host, '10.0.0.1')
  assert.deepStrictEqual(values.kube_worker_nodes, ['10.0.0.2', '10.0.0.3'])
  assert.strictEqual(values.backup_host, '10.0.0.9')
  assert.deepStrictEqual(values.users, [
    {
      name: 'admin',
      ssh_keys: ['ssh-ed25519 test'],
      state: 'present',
      role: 'admin'
    }
  ])
}

testGeneratedValuesAreStableAndScoped()
testLockedDerivedValueIgnoresSubmittedValue()
testGithubDisabledProducesNoGithubPlan()
testReviewSectionsFollowDeploymentFeatures()
testNextStepsHideWhenInventoryAlreadyExists()
testFieldActivationWithBindingsAndRequires()
testBackupRestoreDependencyFieldsPlanGithubUpdates()
testUnchangedGithubVariablesAreNotUpdated()
testHiddenGeneratedSecretIsOnlyCreatedForNewEnvironment()
testHiddenSecretsAreExcludedFromReviewPlan()
testDefaultUserPasswordIsOmittedWhenSmtpEnabled()
testInventoryValuesFollowAnsibleBindings()

console.log('configurator regression tests passed')
