import { spawn } from 'child_process'
import fs from 'fs'
import http from 'http'
import { AddressInfo } from 'net'
import os from 'os'
import path from 'path'
import { Octokit } from '@octokit/core'
import { dump as dumpYaml, load as loadYaml } from 'js-yaml'

import {
  CONFIGURATION_FIELDS,
  CONFIGURATION_SCREENS,
  ConfigurationField,
  DerivedValueCondition,
  GithubBinding,
  HelmBinding,
  HelmChart,
  getConfigurationFields,
  validateConfigurationSchema
} from './configuration-fields'
import {
  InfrastructureType,
  SetupOptions,
  createDeploymentContext,
  getActiveFieldBindings as getActiveBindingsForContext,
  getFieldForCurrentDeployment as getFieldForDeploymentContext,
  hasDeploymentFeature as contextHasDeploymentFeature,
  isBindingEnabled as isBindingEnabledForContext,
  isFieldEnabledForDeployment as isFieldEnabledForDeploymentContext,
  isScreenEnabled as isScreenEnabledForContext,
  normalizeInfrastructureType
} from './deployment-context'
import {
  ConfigurationContext,
  ConfigurationValue,
  createFieldDefaultValueResolver,
  deleteNestedValue,
  getDerivedFieldState as resolveDerivedFieldState,
  getNestedValue,
  getResponseValuesForFields as resolveResponseValuesForFields,
  getSubmittedOrDerivedFieldValue as resolveSubmittedOrDerivedFieldValue,
  isRecord,
  setNestedValue,
  valuesEqual
} from './configuration-state'
import { buildInventoryValues } from './ansible-plan'
import { finalizeConfiguration } from './finalize'
import {
  GithubUpdate,
  buildApplicationSecretItems,
  buildGithubUpdates
} from './github-plan'
import { HelmUpdate, buildHelmUpdates } from './helm-plan'
import { buildNextSteps } from './next-steps'
import { buildReviewPlan } from './review-plan'
import { createUiRequestHandler } from './ui-routes'
import { getRepoInfo } from './git'
import {
  Secret,
  Variable,
  createEnvironment,
  createEnvironmentSecret,
  createEnvironmentVariable,
  createRepositorySecret,
  createRepositoryVariable,
  getRepositoryEnvironments,
  getRepositoryId,
  listEnvironmentSecrets,
  listEnvironmentVariables,
  listRepositorySecrets,
  listRepositoryVariables,
  updateEnvironmentVariable,
  updateRepositoryVariable
} from './github'
import { copyChartsValues, generateInventory, getUsers } from './templates'
import { updateWorkflowEnvironments } from './update-workflows'
import { generateLongPassword, readYamlFile } from './utils'
import { generateSSHKeyPair } from './ssh-keygen'

type GitHubConnectionRequest = {
  organisation?: string
  repository?: string
  token?: string
}

type InfrastructureRequest = {
  kubeAPIHost?: string
  kubeWorkerNodes?: string
  kubeApiAllowedCidrs?: string
  enableDiskEncryption?: boolean
  diskSpace?: string
  users?: User[]
}

type ApplicationRequest = {
  domain?: string
  traefikMode?: 'lets_encrypt' | 'static_ssl' | 'custom'
  sslCrt?: string
  sslKey?: string
  dockerhubMode?: 'opencrvs' | 'custom'
  dockerhubOrganisation?: string
  dockerhubRepository?: string
  dockerhubUsername?: string
  dockerhubToken?: string
  smtpEnabled?: boolean
  smtpHost?: string
  smtpUsername?: string
  smtpPassword?: string
  smtpPort?: string
  smtpSecure?: string | boolean
  senderEmailAddress?: string
  alertEmail?: string
  backupRestoreMode?: 'none' | 'backup' | 'restore'
  backupHost?: string
  backupUser?: string
  backupType?: string
  restoreEnvironmentName?: string
  restoreType?: string
}

type EnvironmentSelectionRequest = {
  environmentName?: string
  customEnvironmentName?: string
  environmentType?: string
  approvalRequired?: boolean
  githubApprovers?: string
}

type SetupOptionsRequest = {
  enableGithubIntegration?: boolean
  infrastructureType?: InfrastructureType
}

type AdvancedRequest = {
  values?: Record<string, unknown>
}

type DependenciesRequest = {
  values?: Record<string, unknown>
}

type ConfigurationScreenRequest = {
  values?: Record<string, unknown>
  custom?: {
    users?: User[]
  }
}

type User = {
  name: string
  ssh_keys: string[]
  state: 'present' | 'absent'
  role: 'admin' | 'operator'
}

const DEFAULT_ENVIRONMENT_CHOICES = [
  { name: 'Development', value: 'development' },
  { name: 'Quality assurance (no PII data)', value: 'qa' },
  { name: 'Staging (hosts PII data, no backups)', value: 'staging' },
  {
    name: 'Production (hosts PII data, requires frequent backups)',
    value: 'production'
  }
]

const HOST = process.env.ENVIRONMENT_INIT_UI_HOST || '127.0.0.1'
const PUBLIC_HOST =
  process.env.ENVIRONMENT_INIT_UI_PUBLIC_HOST ||
  (HOST === '0.0.0.0' ? '127.0.0.1' : HOST)
const DEFAULT_PORT = Number(process.env.ENVIRONMENT_INIT_UI_PORT || 0)
const OPEN_BROWSER = process.env.ENVIRONMENT_INIT_UI_OPEN_BROWSER !== 'false'
const CURRENT_SYSTEM_USER_AVAILABLE =
  process.env.ENVIRONMENT_INIT_UI_CONTAINER !== 'true'
const EXISTING_SECRET_SENTINEL = '__OPENCRVS_EXISTING_SECRET_4F7A9C2D__'
const UI_DIRECTORY = path.join(__dirname, 'ui')
const BOOTSTRAP_CSS = require.resolve('bootstrap/dist/css/bootstrap.min.css')

validateConfigurationSchema()

let verifiedConnection: GitHubConnectionRequest | null = null
let infrastructureConfig: InfrastructureRequest | null = null
let repositoryId: number | null = null
let existingEnvironments: string[] = []
let repositoryVariables: Variable[] = []
let repositorySecrets: Secret[] = []
let environmentVariables: Variable[] = []
let environmentSecrets: Secret[] = []
let environmentSelection: Required<EnvironmentSelectionRequest> | null = null
let setupOptions: SetupOptions = {
  enableGithubIntegration: true,
  infrastructureType: 'on-premise'
}
let users: User[] = []
let applicationConfig: ApplicationRequest | null = null
let generatedEncryptionKey = ''
let generatedBackupEncryptionPassphrase = ''
let generatedBackupHostPrivateKey = ''
let generatedBackupHostPublicKey = ''
let dependenciesConfig: Record<string, ConfigurationValue> = {}
let screenConfigs: Record<string, Record<string, Record<string, ConfigurationValue>>> = {}
let helmBaseOverrides: Partial<Record<HelmChart, Record<string, unknown>>> = {}
let lastValuesSecretsPath = ''
let getFieldDefaultValue = createFieldDefaultValueResolver()

function resetConfiguratorSession() {
  verifiedConnection = null
  infrastructureConfig = null
  repositoryId = null
  existingEnvironments = []
  repositoryVariables = []
  repositorySecrets = []
  environmentVariables = []
  environmentSecrets = []
  environmentSelection = null
  setupOptions = {
    enableGithubIntegration: true,
    infrastructureType: 'on-premise'
  }
  users = []
  applicationConfig = null
  generatedEncryptionKey = ''
  generatedBackupEncryptionPassphrase = ''
  generatedBackupHostPrivateKey = ''
  generatedBackupHostPublicKey = ''
  dependenciesConfig = {}
  screenConfigs = {}
  helmBaseOverrides = {}
  lastValuesSecretsPath = ''
  getFieldDefaultValue = createFieldDefaultValueResolver()
}

function getGitHubDefaults() {
  const repoInfo = getRepoInfo()

  return {
    organisation: process.env.GITHUB_ORGANISATION || repoInfo.organization,
    repository: process.env.GITHUB_REPOSITORY || repoInfo.repository
  }
}

function getDeploymentContext() {
  return createDeploymentContext(setupOptions)
}

function getDeploymentFeatures() {
  return getDeploymentContext().deploymentFeatures
}

function hasDeploymentFeature(feature: Parameters<typeof contextHasDeploymentFeature>[1]) {
  return contextHasDeploymentFeature(getDeploymentContext(), feature)
}

function isBindingEnabled(binding: { target: string }) {
  return isBindingEnabledForContext(getDeploymentContext(), binding)
}

function isScreenEnabled(
  definition: Parameters<typeof isScreenEnabledForContext>[1]
) {
  return isScreenEnabledForContext(getDeploymentContext(), definition)
}

function isFieldEnabledForDeployment(field: ConfigurationField) {
  return isFieldEnabledForDeploymentContext(getDeploymentContext(), field)
}

function getActiveFieldBindings(field: ConfigurationField) {
  return getActiveBindingsForContext(getDeploymentContext(), field)
}

function getFieldForCurrentDeployment(field: ConfigurationField) {
  return getFieldForDeploymentContext(getDeploymentContext(), field)
}

function getFieldSource(field: ConfigurationField) {
  return field.bindings[0]
}

function getSubScreenId(field: ConfigurationField) {
  return field.subScreen || 'general'
}

function getScreenFields(screenId: string, subScreenId?: string | null) {
  const fields = getConfigurationFields(screenId)
  if (!subScreenId) {
    return fields
  }
  return fields.filter((field) => getSubScreenId(field) === subScreenId)
}

function getGeneralScreenFields(screenId: string) {
  return getScreenFields(screenId, 'general')
}

function isFieldVisibleInUi(field: ConfigurationField) {
  return !field.hidden
}

function getAllAdvancedFields() {
  return CONFIGURATION_FIELDS.filter((field) => getSubScreenId(field) !== 'general')
}

function getSubScreenConfig(screenId: string, subScreenId = 'general') {
  return screenConfigs[screenId]?.[subScreenId] || {}
}

function getScreenStoredValues(screenId: string) {
  return Object.assign({}, ...Object.values(screenConfigs[screenId] || {}))
}

function setScreenFieldValues(
  screenId: string,
  fields: ConfigurationField[],
  values: Record<string, ConfigurationValue>
) {
  screenConfigs[screenId] ||= {}

  for (const field of fields) {
    if (!(field.id in values)) {
      continue
    }

    const subScreenId = getSubScreenId(field)
    screenConfigs[screenId][subScreenId] ||= {}
    screenConfigs[screenId][subScreenId][field.id] = values[field.id]
  }
}

function getGenericScreenConfigsForGithub() {
  const specializedScreens = new Set([
    'infrastructure',
    'application',
    'containerRegistry',
    'dependencies'
  ])

  return Object.fromEntries(
    CONFIGURATION_SCREENS
      .filter(({ id }) => !specializedScreens.has(id))
      .map(({ id }) => [id, getScreenStoredValues(id)])
  )
}

function isFieldIdEnabled(fieldId: string) {
  const field = CONFIGURATION_FIELDS.find(({ id }) => id === fieldId)
  return field ? isFieldEnabledForDeployment(field) : false
}

function saveSetupOptions(payload: SetupOptionsRequest) {
  setupOptions = {
    enableGithubIntegration: payload.enableGithubIntegration !== false,
    infrastructureType: normalizeInfrastructureType(payload.infrastructureType)
  }

  if (!hasDeploymentFeature('github')) {
    verifiedConnection = null
    repositoryId = null
    repositoryVariables = []
    repositorySecrets = []
    environmentVariables = []
    environmentSecrets = []
  }

  if (!hasDeploymentFeature('ansible')) {
    infrastructureConfig = null
    users = []
  }

  return {
    ...setupOptions,
    deploymentFeatures: getDeploymentFeatures()
  }
}

async function verifyGitHubConnection({
  organisation,
  repository,
  token
}: GitHubConnectionRequest) {
  if (!organisation || !repository || !token) {
    throw new Error('Organisation, repository, and token are required.')
  }

  const octokit = new Octokit({ auth: token })
  repositoryId = await getRepositoryId(octokit, organisation, repository)
  existingEnvironments = await getRepositoryEnvironments(
    octokit,
    organisation,
    repository
  )
  repositoryVariables = await listRepositoryVariables(
    octokit,
    organisation,
    repository
  )
  repositorySecrets = await listRepositorySecrets(
    octokit,
    organisation,
    repository
  )

  verifiedConnection = {
    organisation,
    repository,
    token
  }

  return repositoryId
}

function getGitHubConnectionResponse() {
  return {
    connected: true,
    repositoryId,
    organisation: verifiedConnection?.organisation,
    repository: verifiedConnection?.repository,
    environmentChoices: getEnvironmentChoices(),
    existingEnvironments,
    repositoryVariableCount: repositoryVariables.length,
    repositorySecretCount: repositorySecrets.length,
    githubApprovers: getRepositoryVariableValue('GH_APPROVERS')
  }
}

function getEnvironmentChoices() {
  return [
    ...DEFAULT_ENVIRONMENT_CHOICES,
    ...existingEnvironments
      .filter(
        (environment) =>
          !DEFAULT_ENVIRONMENT_CHOICES.some(
            (choice) => choice.value === environment
          )
      )
      .map((environment) => ({
        name: environment,
        value: environment
      }))
  ]
}

function inferEnvironmentType(environmentName: string) {
  if (['staging', 'production'].includes(environmentName)) {
    return 'production'
  }
  return 'non-production'
}

function getRepositoryVariableValue(name: string) {
  return repositoryVariables.find((variable) => variable.name === name)?.value || ''
}

function hasRepositorySecret(name: string) {
  return Boolean(repositorySecrets.find((secret) => secret.name === name))
}

function getEnvironmentVariableValue(name: string) {
  return environmentVariables.find((variable) => variable.name === name)?.value || ''
}

function getEnvironmentBooleanVariable(name: string) {
  return getEnvironmentVariableValue(name).trim().toLowerCase() === 'true'
}

function hasEnvironmentSecret(name: string) {
  return Boolean(environmentSecrets.find((secret) => secret.name === name))
}

function getStateFieldValueFromGitHub(field: ConfigurationField): ConfigurationValue | undefined {
  const hasStaticSsl = hasEnvironmentSecret('SSL_CRT') || hasEnvironmentSecret('SSL_KEY')
  const hasDockerhubAccount = hasRepositorySecret('DOCKERHUB_ACCOUNT')
  const hasDockerhubRepo = hasRepositorySecret('DOCKERHUB_REPO')
  const hasDockerhubCredentials =
    hasRepositorySecret('DOCKER_USERNAME') || hasRepositorySecret('DOCKER_TOKEN')
  const backupHost = getEnvironmentVariableValue('BACKUP_HOST')
  const restoreEnvironmentName = getEnvironmentVariableValue('RESTORE_ENVIRONMENT_NAME')
  const hasSmtpConfiguration =
    hasEnvironmentSecret('SMTP_HOST') ||
    hasEnvironmentSecret('SMTP_USERNAME') ||
    hasEnvironmentSecret('SMTP_PASSWORD') ||
    hasEnvironmentSecret('SMTP_PORT') ||
    hasEnvironmentSecret('SMTP_SECURE') ||
    hasEnvironmentSecret('SENDER_EMAIL_ADDRESS') ||
    hasEnvironmentSecret('ALERT_EMAIL')

  switch (field.id) {
    case 'traefikMode':
      return hasStaticSsl ? 'static_ssl' : 'lets_encrypt'
    case 'dockerhubMode':
      return (
        hasDockerhubAccount && hasDockerhubRepo && !hasDockerhubCredentials
          ? 'opencrvs'
          : 'custom'
      )
    case 'smtpEnabled':
      return hasSmtpConfiguration
    case 'backupRestoreMode':
      return backupHost ? 'backup' : restoreEnvironmentName ? 'restore' : 'none'
    default:
      return undefined
  }
}

function getGithubBindingValue(binding: GithubBinding, field: ConfigurationField) {
  if (binding.type === 'VARIABLE') {
    const value = binding.scope === 'ENVIRONMENT'
      ? getEnvironmentVariableValue(binding.name)
      : getRepositoryVariableValue(binding.name)

    if (field.control === 'checkbox') {
      return value ? value.trim().toLowerCase() === 'true' : undefined
    }

    return value || undefined
  }

  const exists = binding.scope === 'ENVIRONMENT'
    ? hasEnvironmentSecret(binding.name)
    : hasRepositorySecret(binding.name)

  if (!exists) {
    return undefined
  }

  return ''
}

function getFieldValueFromGitHub(
  field: ConfigurationField,
  environmentName: string
) {
  const stateValue = getStateFieldValueFromGitHub(field)
  if (stateValue !== undefined) {
    return stateValue
  }

  const githubBinding = getActiveFieldBindings(field).find(
    (binding): binding is GithubBinding => binding.target === 'github'
  )
  const githubValue = githubBinding
    ? getGithubBindingValue(githubBinding, field)
    : undefined

  return githubValue === undefined
    ? getContextualDefaultValue(field)
    : githubValue
}

function getScreenConfigFromGitHub(
  screenId: string,
  subScreenId: string | null,
  environmentName: string
) {
  const fields = getScreenFields(screenId, subScreenId)
  return Object.fromEntries(
    fields.map((field) => [
      field.id,
      getFieldValueFromGitHub(field, environmentName)
    ])
  ) as Record<string, ConfigurationValue>
}

function getScreenConfig(
  screenId: string,
  subScreenId: string | null,
  environmentName: string
) {
  const fields = getScreenFields(screenId, subScreenId)
  return Object.fromEntries(
    fields.map((field) => [
      field.id,
      getFieldConfigValue(field, environmentName)
    ])
  ) as Record<string, ConfigurationValue>
}

function getInventoryPath(environmentName: string) {
  return path.join(
    process.cwd(),
    'infrastructure',
    'server-setup',
    'inventory',
    `${environmentName}.yml`
  )
}

function loadUsersFromInventory(environmentName: string) {
  const inventoryPath = getInventoryPath(environmentName)

  if (!fs.existsSync(inventoryPath)) {
    users = []
    return
  }

  try {
    users = getUsers(readYamlFile(inventoryPath))
  } catch {
    users = []
  }
}

function getHelmOverridePath(environmentName: string, chart: HelmChart) {
  return path.join(
    process.cwd(),
    'environments',
    environmentName,
    chart,
    'values.override.yaml'
  )
}

function readHelmOverride(environmentName: string, chart: HelmChart) {
  const overridePath = getHelmOverridePath(environmentName, chart)

  if (!fs.existsSync(overridePath)) {
    return {}
  }

  const parsed = loadYaml(fs.readFileSync(overridePath, 'utf8'))
  return isRecord(parsed) ? parsed : {}
}

function getFieldConfigValue(
  field: ConfigurationField,
  environmentName: string
) {
  const source = getFieldSource(field)
  const value = source?.target === 'helm'
    ? getNestedValue(helmBaseOverrides[source.chart] || {}, source.path)
    : getFieldValueFromGitHub(field, environmentName)

  return typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
    ? value
    : getContextualDefaultValue(field)
}

function loadScreenConfigs(environmentName: string) {
  const charts = [...new Set(CONFIGURATION_FIELDS.flatMap((field) =>
    field.bindings
      .filter((binding): binding is HelmBinding => binding.target === 'helm')
      .map((binding) => binding.chart)
  ))]

  helmBaseOverrides = Object.fromEntries(
    charts.map((chart) => [chart, readHelmOverride(environmentName, chart)])
  )

  screenConfigs = Object.fromEntries(
    CONFIGURATION_SCREENS.map(({ id }) => {
      const subScreenIds = [...new Set(
        getConfigurationFields(id).map(getSubScreenId)
      )]

      return [
        id,
        Object.fromEntries(
          subScreenIds.map((subScreenId) => [
            subScreenId,
            getScreenConfig(id, subScreenId, environmentName)
          ])
        )
      ]
    })
  )

  dependenciesConfig = screenConfigs.dependencies?.general || {}
}

function getDependenciesResponse() {
  const fields = getDependenciesFields()
    .filter(isFieldEnabledForDeployment)
    .filter(isFieldVisibleInUi)
    .map(getFieldForResponse)
  return {
    fields,
    values: getResponseValuesForFields(fields, dependenciesConfig),
    existingSecrets: Object.fromEntries(
      fields.map((field) => {
        const source = getFieldSource(field)
        const exists = source?.target === 'github' && source.scope === 'ENVIRONMENT'
          ? secretExists('ENVIRONMENT', source.name)
          : source?.target === 'github' && source.scope === 'REPOSITORY'
            ? secretExists('REPOSITORY', source.name)
            : false
        return [field.id, exists]
      })
    ),
    secretSentinel: EXISTING_SECRET_SENTINEL
  }
}

function getAdvancedResponse() {
  const fields = getAllAdvancedFields()
    .filter(isFieldEnabledForDeployment)
    .filter(isFieldVisibleInUi)
    .map(getFieldForResponse)
  const values = Object.assign(
    {},
    ...CONFIGURATION_SCREENS.map(({ id }) =>
      Object.assign(
        {},
        ...Object.entries(screenConfigs[id] || {})
          .filter(([subScreenId]) => subScreenId !== 'general')
          .map(([, subScreenValues]) => subScreenValues)
      )
    )
  )

  return {
    fields,
    values: getResponseValuesForFields(fields, values),
    existingSecrets: Object.fromEntries(
      fields.map((field) => {
        const source = getFieldSource(field)
        return [
          field.id,
          source?.target === 'github' && secretExists(source.scope, source.name)
        ]
      })
    )
  }
}

function getConfigurationScreenResponse(screenId: string) {
  const definition = CONFIGURATION_SCREENS.find(({ id }) => id === screenId)
  if (!definition) {
    throw new Error(`Unknown configuration screen: ${screenId}`)
  }
  if (!isScreenEnabled(definition)) {
    throw new Error(`Configuration screen is disabled for this setup type: ${screenId}`)
  }

  const fields = (screenId === 'infrastructure'
    ? getInfrastructureFields()
    : screenId === 'application'
      ? getApplicationFields()
      : screenId === 'dependencies'
        ? getDependenciesFields()
        : getConfigurationFields(screenId))
    .filter(isFieldEnabledForDeployment)
    .filter(isFieldVisibleInUi)
    .map(getFieldForResponse)
  const existingSecrets = Object.fromEntries(
    fields.map((field) => {
      const source = getFieldSource(field)
      return [
        field.id,
        source?.target === 'github' && secretExists(source.scope, source.name)
      ]
    })
  )
  const storedValues = screenId === 'infrastructure'
    ? { ...(infrastructureConfig || {}) }
    : screenId === 'application'
      ? { ...(applicationConfig || {}), ...getScreenStoredValues('application') }
      : screenId === 'dependencies'
        ? { ...dependenciesConfig, ...getScreenStoredValues('dependencies') }
        : getScreenStoredValues(screenId)
  const values = getResponseValuesForFields(fields, storedValues)

  return {
    definition,
    fields,
    values,
    existingSecrets,
    secretSentinel: EXISTING_SECRET_SENTINEL,
    context: getConfigurationContext(),
    custom: definition.customComponents?.includes('users') && hasDeploymentFeature('ansible')
      ? { users }
      : {}
  }
}

function getConfigurationResponse() {
  return CONFIGURATION_SCREENS
    .slice()
    .sort((left, right) => left.order - right.order)
    .filter(isScreenEnabled)
    .filter((definition) =>
      Boolean(definition.customComponents?.length) ||
      getConfigurationFields(definition.id).some(isFieldEnabledForDeployment)
    )
    .map(({ id }) => getConfigurationScreenResponse(id))
}

async function loadEnvironmentValues(environmentName: string) {
  if (hasDeploymentFeature('github') && (!verifiedConnection || !repositoryId)) {
    throw new Error('Connect to GitHub before loading environment values.')
  }

  generatedBackupEncryptionPassphrase = ''
  generatedBackupHostPrivateKey = ''
  generatedBackupHostPublicKey = ''

  if (!hasDeploymentFeature('github') || !existingEnvironments.includes(environmentName)) {
    environmentVariables = []
    environmentSecrets = []
    if (hasDeploymentFeature('ansible')) {
      loadUsersFromInventory(environmentName)
    } else {
      users = []
    }
    loadScreenConfigs(environmentName)
    infrastructureConfig = {
      ...(screenConfigs.infrastructure?.general || {}),
      ...(screenConfigs.infrastructure?.advanced || {}),
      users
    }
    applicationConfig = screenConfigs.application?.general || {}
    return
  }

  const connection = verifiedConnection!
  const currentRepositoryId = repositoryId!
  const octokit = new Octokit({ auth: connection.token })

  environmentVariables = await listEnvironmentVariables(
    octokit,
    currentRepositoryId,
    environmentName
  )
  environmentSecrets = await listEnvironmentSecrets(
    octokit,
    connection.organisation!,
    currentRepositoryId,
    environmentName
  )
  loadUsersFromInventory(environmentName)
  loadScreenConfigs(environmentName)
  infrastructureConfig = {
    ...(screenConfigs.infrastructure?.general || {}),
    ...(screenConfigs.infrastructure?.advanced || {}),
    users
  }
  applicationConfig = screenConfigs.application?.general || {}
}

async function saveEnvironmentSelection(payload: EnvironmentSelectionRequest) {
  if (hasDeploymentFeature('github') && !verifiedConnection) {
    throw new Error('Connect to GitHub before selecting an environment.')
  }

  const environmentName =
    payload.environmentName === '__custom__'
      ? payload.customEnvironmentName?.trim() || ''
      : payload.environmentName?.trim() || ''

  if (!environmentName) {
    throw new Error('Environment name is required.')
  }

  const environmentType =
    payload.environmentType === 'production' ? 'production' : 'non-production'

  environmentSelection = {
    environmentName,
    customEnvironmentName: '',
    environmentType,
    approvalRequired: hasDeploymentFeature('github') && Boolean(payload.approvalRequired),
    githubApprovers: hasDeploymentFeature('github')
      ? payload.githubApprovers?.trim() || ''
      : ''
  }

  await loadEnvironmentValues(environmentName)

  return environmentSelection
}

function validateCIDR(input: string) {
  if (!input.trim()) {
    return true
  }

  const cidrRegex =
    /^((25[0-5]|(2[0-4]|1\d|[1-9]?\d)\d?)\.){3}(25[0-5]|(2[0-4]|1\d|[1-9]?\d)\d?)\/([0-9]|[12][0-9]|3[0-2])$/

  return cidrRegex.test(input.trim())
}

function validateCIDRs(input: string) {
  if (!input.trim()) {
    return true
  }

  const cidrs = input.split(',').map((value) => value.trim())
  return cidrs.every(validateCIDR)
}

function validateUsers(inputUsers: User[]) {
  const seenUsernames = new Set<string>()

  for (const user of inputUsers) {
    if (!user.name.trim()) {
      throw new Error('Every user must have a username.')
    }

    if (!/^[a-z_][a-z0-9_-]*[$]?$/.test(user.name.trim())) {
      throw new Error(`Invalid username: ${user.name}`)
    }

    if (seenUsernames.has(user.name.trim())) {
      throw new Error(`Duplicate username: ${user.name}`)
    }

    if (!['admin', 'operator'].includes(user.role)) {
      throw new Error(`Invalid role for ${user.name}.`)
    }

    if (!['present', 'absent'].includes(user.state)) {
      throw new Error(`Invalid state for ${user.name}.`)
    }

    seenUsernames.add(user.name.trim())
  }
}

function getInventoryValues(config: InfrastructureRequest) {
  return buildInventoryValues(config, getBackupRestoreConfig())
}

function getChartValues(config: ApplicationRequest) {
  const environment = environmentSelection?.environmentName || ''
  const environmentType = environmentSelection?.environmentType || 'non-production'
  const backupRestoreConfig = getBackupRestoreConfig()

  return {
    env: environment,
    environment_type: environmentType,
    two_fa_enabled: environmentType !== 'production' ? false : true,
    backup_enabled: backupRestoreConfig.backupRestoreMode === 'backup',
    restore_enabled: backupRestoreConfig.backupRestoreMode === 'restore',
    restore_environment_name:
      backupRestoreConfig.backupRestoreMode === 'restore'
        ? backupRestoreConfig.restoreEnvironmentName || ''
        : '',
    restore_type:
      backupRestoreConfig.backupRestoreMode === 'restore'
        ? backupRestoreConfig.restoreType || 'dump'
        : '',
    traefik_mode: config.traefikMode || 'lets_encrypt',
    smtp_enabled: Boolean(config.smtpEnabled),
    elastalert_notification_type:
      String(getConfigurationFieldValueById('elastalertNotificationType') || 'email'),
    backup_type:
      backupRestoreConfig.backupRestoreMode === 'backup'
        ? backupRestoreConfig.backupType || 'dump'
        : '',
    lets_encrypt: config.traefikMode === 'lets_encrypt',
    static_ssl: config.traefikMode === 'static_ssl',
  }
}

function getApplicationGithubUpdates(config: ApplicationRequest) {
  return {
    variables: [
      { scope: 'ENVIRONMENT', type: 'VARIABLE', name: 'DOMAIN', value: config.domain || '' }
    ],
    secrets: buildApplicationSecretItems(config, hasEnvironmentSecret)
  }
}

function variableExists(scope: 'ENVIRONMENT' | 'REPOSITORY', name: string) {
  const source = scope === 'ENVIRONMENT' ? environmentVariables : repositoryVariables
  return Boolean(source.find((variable) => variable.name === name))
}

function getVariableValue(scope: 'ENVIRONMENT' | 'REPOSITORY', name: string) {
  return scope === 'ENVIRONMENT'
    ? getEnvironmentVariableValue(name)
    : getRepositoryVariableValue(name)
}

function secretExists(scope: 'ENVIRONMENT' | 'REPOSITORY', name: string) {
  const source = scope === 'ENVIRONMENT' ? environmentSecrets : repositorySecrets
  return Boolean(source.find((secret) => secret.name === name))
}

function getExistingSecretState() {
  return Object.fromEntries(
    CONFIGURATION_FIELDS.flatMap((field) =>
      field.bindings
        .filter((binding): binding is GithubBinding =>
          binding.target === 'github' && binding.type === 'SECRET'
        )
        .map((binding) => [
          field.id,
          secretExists(binding.scope, binding.name)
        ])
    )
  )
}

function getBackupRestoreState() {
  const environmentName = environmentSelection?.environmentName || ''
  const hasConfiguredBackupOrRestore = getPersistedBackupRestoreMode() !== 'none'

  return {
    locked: Boolean(
      environmentName &&
      existingEnvironments.includes(environmentName) &&
      hasConfiguredBackupOrRestore
    ),
    restoreEnvironmentChoices: existingEnvironments.filter(
      (environment) => environment !== environmentName
    )
  }
}

function normalizeBackupRestoreMode(value: unknown): 'none' | 'backup' | 'restore' {
  return value === 'backup' || value === 'restore' ? value : 'none'
}

function getPersistedBackupRestoreMode(): 'none' | 'backup' | 'restore' {
  if (getEnvironmentVariableValue('BACKUP_HOST')) {
    return 'backup'
  }
  if (getEnvironmentVariableValue('RESTORE_ENVIRONMENT_NAME')) {
    return 'restore'
  }
  return 'none'
}

function getConfigString(value: unknown) {
  return value === undefined || value === null ? '' : String(value)
}

function getBackupRestoreConfig(): ApplicationRequest {
  const backupRestoreMode = normalizeBackupRestoreMode(
    dependenciesConfig.backupRestoreMode ||
      applicationConfig?.backupRestoreMode ||
      getPersistedBackupRestoreMode()
  )

  return {
    backupRestoreMode,
    backupHost: getConfigString(
      dependenciesConfig.backupHost ?? applicationConfig?.backupHost
    ),
    backupUser: getConfigString(
      dependenciesConfig.backupUser ?? applicationConfig?.backupUser
    ),
    backupType: getConfigString(
      dependenciesConfig.backupType ?? applicationConfig?.backupType ?? 'dump'
    ),
    restoreEnvironmentName: getConfigString(
      dependenciesConfig.restoreEnvironmentName ??
        applicationConfig?.restoreEnvironmentName
    ),
    restoreType: getConfigString(
      dependenciesConfig.restoreType ?? applicationConfig?.restoreType ?? 'dump'
    )
  }
}

function isExistingGithubEnvironment() {
  const environmentName = environmentSelection?.environmentName || ''
  return Boolean(
    hasDeploymentFeature('github') &&
    environmentName &&
    existingEnvironments.includes(environmentName)
  )
}

function getInfrastructureFields() {
  const diskEncryptionLocked = isExistingGithubEnvironment()

  return getConfigurationFields('infrastructure').map((field) => {
    if (field.id !== 'enableDiskEncryption' || !diskEncryptionLocked) {
      return field
    }

    return {
      ...field,
      disabled: true,
      description: 'Encrypt /data partition. Property cannot be changed after the GitHub environment is configured.'
    }
  })
}

function getApplicationFields() {
  return getConfigurationFields('application')
}

function getDependenciesFields() {
  const backupRestoreState = getBackupRestoreState()
  const backupRestoreMode = getBackupRestoreConfig().backupRestoreMode

  return getConfigurationFields('dependencies').map((field) => {
    if (field.id === 'backupRestoreMode' && backupRestoreState.locked) {
      return {
        ...field,
        disabled: true,
        description: 'The backup or restore mode is fixed after the GitHub environment is configured.',
        options: field.options?.filter(({ value }) => value === backupRestoreMode)
      }
    }

    if (field.id === 'restoreEnvironmentName') {
      return {
        ...field,
        suggestions: backupRestoreState.restoreEnvironmentChoices
      }
    }

    return field
  })
}

function parseSubmittedSecret(
  scope: 'ENVIRONMENT' | 'REPOSITORY',
  name: string,
  input?: string | boolean
) {
  const value = input === undefined ? '' : String(input).trim()
  const exists = secretExists(scope, name)

  if (!value && exists) {
    return {
      available: true,
      value: ''
    }
  }

  if (value !== EXISTING_SECRET_SENTINEL) {
    return {
      available: Boolean(value),
      value
    }
  }

  if (!exists) {
    throw new Error(`Invalid existing-secret placeholder for ${name}.`)
  }

  return {
    available: true,
    value: ''
  }
}

function getGeneratedEncryptionKey() {
  if (!generatedEncryptionKey) {
    generatedEncryptionKey = generateLongPassword()
  }

  return generatedEncryptionKey
}

function getGeneratedBackupEncryptionPassphrase() {
  if (!generatedBackupEncryptionPassphrase) {
    generatedBackupEncryptionPassphrase = generateLongPassword()
  }

  return generatedBackupEncryptionPassphrase
}

function getGeneratedBackupHostKeyPair() {
  if (!generatedBackupHostPrivateKey) {
    const keyPair = generateSSHKeyPair()
    generatedBackupHostPrivateKey = keyPair.privateKey
    generatedBackupHostPublicKey = keyPair.publicKey
  }

  return {
    privateKey: generatedBackupHostPrivateKey,
    publicKey: generatedBackupHostPublicKey
  }
}

function getGithubUpdates(
  includeSecretValues = false,
  options: { includeExternalSecrets?: boolean } = {}
) {
  const containerRegistryConfig = getScreenStoredValues('containerRegistry')

  return buildGithubUpdates({
    enabled:
      Boolean(environmentSelection) &&
      (hasDeploymentFeature('github') || Boolean(options.includeExternalSecrets)),
    environmentExists: isExistingGithubEnvironment(),
    includeSecretValues,
    approvalRequired: Boolean(environmentSelection?.approvalRequired),
    githubApprovers: environmentSelection?.githubApprovers || '',
    applicationDomain: applicationConfig?.domain || '',
    githubToken: verifiedConnection?.token || '',
    applicationSecrets: applicationConfig
      ? getApplicationGithubUpdates({
          ...applicationConfig,
          ...containerRegistryConfig
        }).secrets
      : [],
    dependencyFields: getGeneralScreenFields('dependencies'),
    advancedFields: getAllAdvancedFields(),
    dependenciesConfig,
    advancedConfig: Object.assign(
      {},
      ...CONFIGURATION_SCREENS.map(({ id }) =>
        Object.assign(
          {},
          ...Object.entries(screenConfigs[id] || {})
            .filter(([subScreenId]) => subScreenId !== 'general')
            .map(([, values]) => values)
        )
      )
    ),
    genericScreenConfigs: getGenericScreenConfigsForGithub(),
    backupEnabled: getBackupRestoreConfig().backupRestoreMode === 'backup',
    diskEncryptionEnabled: Boolean(infrastructureConfig?.enableDiskEncryption),
    isFieldEnabled: isFieldEnabledForDeployment,
    isFieldActive: isConfigurationFieldActive,
    getFieldValue: getConfigurationFieldValue,
    getActiveBindings: getActiveFieldBindings,
    getVariableValue,
    variableExists,
    secretExists,
    hasEnvironmentSecret,
    getEncryptionKey: getGeneratedEncryptionKey,
    getBackupEncryptionPassphrase: getGeneratedBackupEncryptionPassphrase,
    getBackupHostKeyPair: getGeneratedBackupHostKeyPair
  })
}

function getConfigurationContext(): ConfigurationContext {
  return {
    environmentType: environmentSelection?.environmentType || 'non-production'
  }
}

function getContextualDefaultValue(field: ConfigurationField) {
  const defaultRule = field.defaultValueWhen?.find(({ when }) =>
    derivedValueConditionMatches(when)
  )

  return defaultRule
    ? defaultRule.value
    : getFieldDefaultValue(field, environmentSelection?.environmentName || '')
}

function getRawConfigurationFieldValue(field: ConfigurationField): ConfigurationValue {
  const backupRestoreConfig = getBackupRestoreConfig()
  const configuredValues: Record<string, ConfigurationValue> = {
    kubeAPIHost: infrastructureConfig?.kubeAPIHost || '',
    kubeWorkerNodes: infrastructureConfig?.kubeWorkerNodes || '',
    kubeApiAllowedCidrs: infrastructureConfig?.kubeApiAllowedCidrs || '',
    enableDiskEncryption: Boolean(infrastructureConfig?.enableDiskEncryption),
    diskSpace: infrastructureConfig?.diskSpace || '200g',
    domain: applicationConfig?.domain || '',
    traefikMode: applicationConfig?.traefikMode || 'lets_encrypt',
    smtpEnabled: Boolean(applicationConfig?.smtpEnabled),
    backupRestoreMode: backupRestoreConfig.backupRestoreMode || 'none',
    backupHost: backupRestoreConfig.backupHost || '',
    backupType:
      backupRestoreConfig.backupRestoreMode === 'backup'
        ? backupRestoreConfig.backupType || 'dump'
        : '',
    restoreEnvironmentName: backupRestoreConfig.restoreEnvironmentName || '',
    restoreType:
      backupRestoreConfig.backupRestoreMode === 'restore'
        ? backupRestoreConfig.restoreType || 'dump'
        : ''
  }

  return configuredValues[field.id] ??
    dependenciesConfig[field.id] ??
    getScreenStoredValues(field.screen)[field.id] ??
    getContextualDefaultValue(field)
}

function getRawConfigurationFieldValueById(fieldId: string): ConfigurationValue {
  const field = CONFIGURATION_FIELDS.find(({ id }) => id === fieldId)
  return field ? getRawConfigurationFieldValue(field) : ''
}

function getConfigurationFieldValueById(fieldId: string): ConfigurationValue {
  const field = CONFIGURATION_FIELDS.find(({ id }) => id === fieldId)
  return field ? getConfigurationFieldValue(field) : ''
}

function derivedValueConditionMatches(condition: DerivedValueCondition) {
  if ('fieldId' in condition) {
    return valuesEqual(
      getRawConfigurationFieldValueById(condition.fieldId),
      condition.equals
    )
  }

  if ('githubVariable' in condition) {
    return variableExists(
      condition.githubVariable.scope,
      condition.githubVariable.name
    ) === condition.exists
  }

  return valuesEqual(getConfigurationContext()[condition.context], condition.equals)
}

function getDerivedFieldState(field: ConfigurationField) {
  return resolveDerivedFieldState(field, derivedValueConditionMatches)
}

function getConfigurationFieldValue(field: ConfigurationField): ConfigurationValue {
  return getDerivedFieldState(field)?.value ?? getRawConfigurationFieldValue(field)
}

function getSubmittedOrDerivedFieldValue(
  field: ConfigurationField,
  submitted: unknown,
  current: ConfigurationValue
) {
  const derivedState = getDerivedFieldState(field)
  return resolveSubmittedOrDerivedFieldValue(
    getFieldForResponse(field),
    submitted,
    current,
    derivedState
  )
}

function getFieldForResponse(field: ConfigurationField) {
  const deploymentField = getFieldForCurrentDeployment(field)
  const derivedState = getDerivedFieldState(field)
  const readonly = Boolean(
    deploymentField.readonly ||
      deploymentField.readonlyWhen?.some(({ when }) =>
        derivedValueConditionMatches(when)
      )
  )

  return {
    ...deploymentField,
    readonly,
    disabled: Boolean(deploymentField.disabled || derivedState?.locked)
  }
}

function getResponseValuesForFields(
  fields: ConfigurationField[],
  values: Record<string, unknown>
) {
  return resolveResponseValuesForFields(
    fields,
    values,
    getConfigurationFieldValue
  )
}

function isConfigurationFieldActive(field: ConfigurationField) {
  if (!field.visibleWhen) {
    return true
  }

  return valuesEqual(
    getConfigurationFieldValue(
      CONFIGURATION_FIELDS.find(({ id }) => id === field.visibleWhen!.fieldId)!
    ),
    field.visibleWhen.equals
  )
}

function getHelmUpdates(): HelmUpdate[] {
  return buildHelmUpdates({
    enabled: hasDeploymentFeature('helm'),
    fields: CONFIGURATION_FIELDS,
    helmBaseOverrides,
    getFieldValue: getConfigurationFieldValue,
    isFieldEnabled: isFieldEnabledForDeployment,
    isFieldActive: isConfigurationFieldActive,
    getActiveBindings: getActiveFieldBindings
  })
}

function saveScreenFields(
  screenId: string,
  fields: ConfigurationField[],
  submittedValues: Record<string, unknown>
) {
  if (!environmentSelection) {
    throw new Error('Select an environment before configuring Helm values.')
  }

  const currentConfig = getScreenStoredValues(screenId)
  const nextConfig: Record<string, ConfigurationValue> = { ...currentConfig }

  for (const field of fields
    .filter(isFieldEnabledForDeployment)
    .filter(isFieldVisibleInUi)) {
    const submitted = submittedValues[field.id]
    const current = currentConfig[field.id] ?? field.defaultValue ?? ''

    if (field.control === 'checkbox') {
      nextConfig[field.id] = Boolean(
        getSubmittedOrDerivedFieldValue(field, submitted, Boolean(current))
      )
      continue
    }

    const value = getSubmittedOrDerivedFieldValue(field, submitted, current)
    const githubSecret = getActiveFieldBindings(field).find(
      (binding): binding is GithubBinding =>
        binding.target === 'github' && binding.type === 'SECRET'
    )

    if (githubSecret) {
      const secret = parseSubmittedSecret(
        githubSecret.scope,
        githubSecret.name,
        typeof value === 'string' ? value : ''
      )
      if (field.required && !secret.available) {
        throw new Error(`${field.label} is required.`)
      }
      nextConfig[field.id] = secret.value
      continue
    }

    if (field.control === 'number' || field.validator === 'positive-integer') {
      const numberValue = Number(value)
      if (!Number.isInteger(numberValue) || numberValue < 1) {
        throw new Error(`${field.label} must be a positive integer.`)
      }
      nextConfig[field.id] = numberValue
      continue
    }

    const textValue = String(value).trim()
    if (field.validator === 'kubernetes-memory' && !/^\d+(?:\.\d+)?(?:[KMGT]i?)?$/.test(textValue)) {
      throw new Error(`${field.label} must be a Kubernetes memory quantity, for example 512Mi or 8Gi.`)
    }
    nextConfig[field.id] = textValue
  }

  setScreenFieldValues(screenId, fields, nextConfig)
}

function saveAdvancedConfig(payload: AdvancedRequest) {
  for (const definition of CONFIGURATION_SCREENS) {
    saveScreenFields(
      definition.id,
      getScreenFields(definition.id).filter(
        (field) => getSubScreenId(field) !== 'general'
      ),
      payload.values || {}
    )
  }
  return getConfigurationResponse()
}

function saveDependenciesConfig(payload: DependenciesRequest) {
  if (!environmentSelection) {
    throw new Error('Select an environment before configuring dependencies.')
  }

  const submittedValues = payload.values || {}
  const fields = getGeneralScreenFields('dependencies')
    .filter(isFieldEnabledForDeployment)
    .filter(isFieldVisibleInUi)
  const nextConfig: Record<string, ConfigurationValue> = { ...dependenciesConfig }
  const hasBackupRestoreFields = fields.some(({ id }) => id === 'backupRestoreMode')

  if (hasBackupRestoreFields && hasDeploymentFeature('github')) {
    const requestedBackupRestoreMode = normalizeBackupRestoreMode(
      submittedValues.backupRestoreMode ?? getBackupRestoreConfig().backupRestoreMode
    )
    const persistedBackupRestoreMode = getPersistedBackupRestoreMode()
    const backupRestoreLocked =
      persistedBackupRestoreMode !== 'none' &&
      existingEnvironments.includes(environmentSelection.environmentName)

    if (
      backupRestoreLocked &&
      requestedBackupRestoreMode !== persistedBackupRestoreMode
    ) {
      throw new Error(
        'Backup or restore mode cannot be changed after it has been configured.'
      )
    }
  }

  for (const field of fields.filter(({ control }) => control === 'checkbox')) {
    const submitted = submittedValues[field.id]
    nextConfig[field.id] = Boolean(
      getSubmittedOrDerivedFieldValue(
        field,
        submitted,
        Boolean(dependenciesConfig[field.id] ?? field.defaultValue)
      )
    )
  }

  dependenciesConfig = nextConfig

  for (const field of fields.filter(({ control }) => control !== 'checkbox')) {
    if (!isConfigurationFieldActive(field)) {
      continue
    }

    const submitted = submittedValues[field.id]
    const value = getSubmittedOrDerivedFieldValue(
      field,
      submitted,
      dependenciesConfig[field.id] ?? field.defaultValue ?? ''
    )
    const githubSecret = getActiveFieldBindings(field).find(
      (binding): binding is GithubBinding =>
        binding.target === 'github' && binding.type === 'SECRET'
    )

    if (githubSecret) {
      const secret = parseSubmittedSecret(
        githubSecret.scope,
        githubSecret.name,
        typeof value === 'string' ? value : ''
      )
      if (field.required && !secret.available) {
        throw new Error(`${field.label} is required.`)
      }
      nextConfig[field.id] = secret.value
      continue
    }

    if (field.control === 'number' || field.validator === 'positive-integer') {
      const numberValue = Number(value)
      if (!Number.isInteger(numberValue) || numberValue < 1) {
        throw new Error(`${field.label} must be a positive integer.`)
      }
      nextConfig[field.id] = numberValue
      continue
    }

    const textValue = String(value ?? '').trim()
    if (field.required && !textValue) {
      throw new Error(`${field.label} is required.`)
    }
    if (
      field.control === 'select' &&
      !field.options?.some((option) => option.value === textValue)
    ) {
      throw new Error(`${field.label} has an invalid value.`)
    }
    nextConfig[field.id] = textValue
  }

  if (
    hasDeploymentFeature('github') &&
    nextConfig.backupRestoreMode === 'restore' &&
    nextConfig.restoreEnvironmentName === environmentSelection.environmentName
  ) {
    throw new Error('An environment cannot restore a backup from itself.')
  }

  dependenciesConfig = nextConfig
  return getDependenciesResponse()
}

function saveGenericScreenConfig(
  screenId: string,
  submittedValues: Record<string, unknown>
) {
  const fields = getConfigurationFields(screenId)
    .filter(isFieldEnabledForDeployment)
    .filter(isFieldVisibleInUi)
  const currentConfig = getScreenStoredValues(screenId)
  const nextConfig: Record<string, ConfigurationValue> = { ...currentConfig }

  for (const field of fields.filter(({ control }) => control === 'checkbox')) {
    const submitted = submittedValues[field.id]
    nextConfig[field.id] = Boolean(
      getSubmittedOrDerivedFieldValue(
        field,
        submitted,
        Boolean(currentConfig[field.id] ?? field.defaultValue)
      )
    )
  }
  setScreenFieldValues(screenId, fields, nextConfig)

  for (const field of fields.filter(({ control }) => control !== 'checkbox')) {
    if (!isConfigurationFieldActive(field)) {
      continue
    }

    const submitted = submittedValues[field.id]
    const value = getSubmittedOrDerivedFieldValue(
      field,
      submitted,
      currentConfig[field.id] ?? field.defaultValue ?? ''
    )
    const githubSecret = getActiveFieldBindings(field).find(
      (binding): binding is GithubBinding =>
        binding.target === 'github' && binding.type === 'SECRET'
    )

    if (githubSecret) {
      const secret = parseSubmittedSecret(
        githubSecret.scope,
        githubSecret.name,
        typeof value === 'string' ? value : ''
      )
      if (field.required && !secret.available) {
        throw new Error(`${field.label} is required.`)
      }
      nextConfig[field.id] = secret.value
      continue
    }

    if (field.control === 'number' || field.validator === 'positive-integer') {
      const numberValue = Number(value)
      if (!Number.isInteger(numberValue) || numberValue < 1) {
        throw new Error(`${field.label} must be a positive integer.`)
      }
      nextConfig[field.id] = numberValue
      continue
    }

    const textValue = String(value ?? '').trim()
    if (field.required && !textValue) {
      throw new Error(`${field.label} is required.`)
    }
    if (field.validator === 'kubernetes-memory' && !/^\d+(?:\.\d+)?(?:[KMGT]i?)?$/.test(textValue)) {
      throw new Error(`${field.label} must be a Kubernetes memory quantity, for example 512Mi or 8Gi.`)
    }
    if (
      field.control === 'select' &&
      !field.options?.some((option) => option.value === textValue)
    ) {
      throw new Error(`${field.label} has an invalid value.`)
    }
    nextConfig[field.id] = textValue
  }

  setScreenFieldValues(screenId, fields, nextConfig)
}

function writeHelmOverrides(environmentName: string, updates = getHelmUpdates()) {
  const charts = [...new Set(updates.map((update) => update.chart))]

  for (const chart of charts) {
    const output = structuredClone(helmBaseOverrides[chart] || {})
    const chartUpdates = updates.filter((update) => update.chart === chart)

    for (const update of chartUpdates) {
      if (update.action === 'remove') {
        deleteNestedValue(output, update.path)
      } else if (update.action === 'set') {
        setNestedValue(output, update.path, update.value)
      }
    }

    const header = [
      '##################################################################################',
      '# Environment-specific Helm overrides managed by yarn environment:init',
      '# Unmanaged keys are preserved when this file is updated.',
      '##################################################################################',
      ''
    ].join('\n')
    const yaml = Object.keys(output).length
      ? dumpYaml(output, { noRefs: true, lineWidth: 100 })
      : ''
    const outputPath = getHelmOverridePath(environmentName, chart)

    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, `${header}${yaml}`, 'utf8')
    helmBaseOverrides[chart] = output
  }
}

function getReviewPlan(includeSecretValues = false) {
  const githubUpdates = getGithubUpdates(includeSecretValues)

  return buildReviewPlan({
    environmentName: environmentSelection?.environmentName || '<environment>',
    deploymentFeatures: getDeploymentFeatures(),
    includeSecretValues,
    githubUpdates,
    inventoryValues: hasDeploymentFeature('ansible') && infrastructureConfig
      ? getInventoryValues(infrastructureConfig)
      : null,
    chartValues: hasDeploymentFeature('helm') && applicationConfig
      ? getChartValues(applicationConfig)
      : null,
    helmUpdates: getHelmUpdates()
  })
}

function assertReadyToFinalize() {
  if (hasDeploymentFeature('github') && (!verifiedConnection || !repositoryId)) {
    throw new Error('Connect to GitHub before finalizing setup.')
  }

  if (!environmentSelection) {
    throw new Error('Select an environment before finalizing setup.')
  }

  if (hasDeploymentFeature('ansible') && !infrastructureConfig) {
    throw new Error('Save infrastructure configuration before finalizing setup.')
  }

  if (hasDeploymentFeature('helm') && !applicationConfig) {
    throw new Error('Save application configuration before finalizing setup.')
  }
}

function getNextSteps(inventoryAlreadyExists?: boolean) {
  const backupRestoreConfig = getBackupRestoreConfig()

  return buildNextSteps({
    ansibleEnabled: hasDeploymentFeature('ansible'),
    environmentName: environmentSelection!.environmentName,
    organisation: verifiedConnection?.organisation,
    repository: verifiedConnection?.repository,
    token: verifiedConnection?.token,
    kubeAPIHost: infrastructureConfig?.kubeAPIHost,
    kubeWorkerNodes: infrastructureConfig?.kubeWorkerNodes,
    backupEnabled: backupRestoreConfig.backupRestoreMode === 'backup',
    backupHost: backupRestoreConfig.backupHost,
    inventoryAlreadyExists
  })
}

async function applyGithubUpdate(octokit: Octokit, update: GithubUpdate) {
  if (update.action === 'unchanged') {
    return
  }

  if (update.type === 'VARIABLE') {
    if (update.scope === 'ENVIRONMENT') {
      if (update.action === 'update') {
        await updateEnvironmentVariable(
          octokit,
          repositoryId!,
          environmentSelection!.environmentName,
          update.name,
          update.value
        )
      } else {
        await createEnvironmentVariable(
          octokit,
          repositoryId!,
          environmentSelection!.environmentName,
          update.name,
          update.value
        )
      }
    } else if (update.action === 'update') {
      await updateRepositoryVariable(
        octokit,
        repositoryId!,
        update.name,
        update.value
      )
    } else {
      await createRepositoryVariable(
        octokit,
        repositoryId!,
        update.name,
        update.value
      )
    }
  }

  if (update.type === 'SECRET') {
    if (update.scope === 'ENVIRONMENT') {
      await createEnvironmentSecret(
        octokit,
        repositoryId!,
        environmentSelection!.environmentName,
        update.name,
        update.value,
        verifiedConnection!.organisation!,
        verifiedConnection!.repository!
      )
    } else {
      await createRepositorySecret(
        octokit,
        repositoryId!,
        update.name,
        update.value,
        verifiedConnection!.organisation!,
        verifiedConnection!.repository!
      )
    }
  }
}

async function applyGithubUpdates(octokit: Octokit, updates: GithubUpdate[]) {
  const performedActions: string[] = []

  for (const update of updates) {
    if (update.action === 'unchanged') {
      performedActions.push(
        `Skipped unchanged ${update.scope.toLowerCase()} ${update.type.toLowerCase()} ${update.name}`
      )
      continue
    }

    await applyGithubUpdate(octokit, update)
    performedActions.push(
      `${update.action === 'update' ? 'Updated' : 'Created'} ${update.scope.toLowerCase()} ${update.type.toLowerCase()} ${update.name}`
    )
  }

  return performedActions
}

async function applyGithubFinalization(updates: GithubUpdate[]) {
  const performedActions: string[] = []

  await updateWorkflowEnvironments()
  performedActions.push('Updated GitHub workflow environment options')

  const octokit = new Octokit({ auth: verifiedConnection!.token })
  await createEnvironment(
    octokit,
    environmentSelection!.environmentName,
    verifiedConnection!.organisation!,
    verifiedConnection!.repository!
  )
  performedActions.push(
    `Created or updated GitHub environment ${environmentSelection!.environmentName}`
  )
  performedActions.push(...(await applyGithubUpdates(octokit, updates)))

  return performedActions
}

async function finalizeSetup() {
  assertReadyToFinalize()

  const environment = environmentSelection!.environmentName
  const inventoryAlreadyExists = fs.existsSync(getInventoryPath(environment))
  const inventoryValues = infrastructureConfig
    ? getInventoryValues(infrastructureConfig)
    : null
  const chartValues = applicationConfig
    ? getChartValues(applicationConfig)
    : null
  const debugPlan = getReviewPlan(true)
  const githubUpdates = getGithubUpdates(true, {
    includeExternalSecrets: !hasDeploymentFeature('github') && hasDeploymentFeature('helm')
  })
  const helmUpdates = getHelmUpdates()

  console.log('\nOpenCRVS environment:init GitHub debug payload')
  console.log(JSON.stringify(debugPlan, null, 2))

  const finalizeResult = await finalizeConfiguration({
    environmentName: environment,
    githubEnabled: hasDeploymentFeature('github'),
    ansibleEnabled: hasDeploymentFeature('ansible'),
    helmEnabled: hasDeploymentFeature('helm'),
    inventoryValues,
    chartValues,
    githubUpdates,
    helmUpdates,
    applyInventory: (name, values) => generateInventory(name, values as Record<string, any>),
    applyChartValues: (name, values) =>
      copyChartsValues(name, values as Record<string, string | boolean>),
    applyHelmUpdates: (updates) => writeHelmOverrides(environment, updates),
    applyGithub: applyGithubFinalization
  })

  lastValuesSecretsPath = finalizeResult.valuesSecretsFile
    ? path.join(process.cwd(), finalizeResult.valuesSecretsFile.path)
    : ''

  const reviewPlan = getReviewPlan(false)

  if (finalizeResult.valuesSecretsFile) {
    reviewPlan.files.push(finalizeResult.valuesSecretsFile.path)
  }

  return {
    ...reviewPlan,
    performedActions: finalizeResult.performedActions,
    valuesSecretsFile: finalizeResult.valuesSecretsFile,
    nextSteps: getNextSteps(inventoryAlreadyExists)
  }
}

function saveApplicationConfig(payload: ApplicationRequest) {
  if (hasDeploymentFeature('github') && !verifiedConnection) {
    throw new Error('Connect to GitHub before configuring application settings.')
  }

  if (!environmentSelection) {
    throw new Error('Select an environment before configuring application settings.')
  }

  if (isFieldIdEnabled('domain') && !payload.domain?.trim()) {
    throw new Error('DOMAIN is required.')
  }

  const traefikMode = payload.traefikMode || 'lets_encrypt'
  const sslCrt = parseSubmittedSecret('ENVIRONMENT', 'SSL_CRT', payload.sslCrt)
  const sslKey = parseSubmittedSecret('ENVIRONMENT', 'SSL_KEY', payload.sslKey)

  if (
    hasDeploymentFeature('github') &&
    isFieldIdEnabled('sslCrt') &&
    traefikMode === 'static_ssl' &&
    (!sslCrt.available || !sslKey.available)
  ) {
    throw new Error('SSL certificate and key are required for static SSL.')
  }

  const smtpEnabled = hasDeploymentFeature('github') && Boolean(payload.smtpEnabled)
  const smtpSecrets = {
    smtpHost: parseSubmittedSecret('ENVIRONMENT', 'SMTP_HOST', payload.smtpHost),
    smtpUsername: parseSubmittedSecret(
      'ENVIRONMENT',
      'SMTP_USERNAME',
      payload.smtpUsername
    ),
    smtpPassword: parseSubmittedSecret(
      'ENVIRONMENT',
      'SMTP_PASSWORD',
      payload.smtpPassword
    ),
    smtpPort: parseSubmittedSecret('ENVIRONMENT', 'SMTP_PORT', payload.smtpPort),
    smtpSecure: parseSubmittedSecret(
      'ENVIRONMENT',
      'SMTP_SECURE',
      payload.smtpSecure
    ),
    senderEmailAddress: parseSubmittedSecret(
      'ENVIRONMENT',
      'SENDER_EMAIL_ADDRESS',
      payload.senderEmailAddress
    ),
    alertEmail: parseSubmittedSecret('ENVIRONMENT', 'ALERT_EMAIL', payload.alertEmail)
  }

  if (
    hasDeploymentFeature('github') &&
    smtpEnabled &&
    Object.values(smtpSecrets).some((secret) => !secret.available)
  ) {
    throw new Error('All SMTP configuration fields are required when SMTP is enabled.')
  }

  const backupRestoreConfig = getBackupRestoreConfig()

  applicationConfig = {
    domain: payload.domain?.trim() || '',
    traefikMode,
    sslCrt: traefikMode === 'static_ssl' ? sslCrt.value : '',
    sslKey: traefikMode === 'static_ssl' ? sslKey.value : '',
    smtpEnabled,
    smtpHost: smtpEnabled ? smtpSecrets.smtpHost.value : '',
    smtpUsername: smtpEnabled ? smtpSecrets.smtpUsername.value : '',
    smtpPassword: smtpEnabled ? smtpSecrets.smtpPassword.value : '',
    smtpPort: smtpEnabled ? smtpSecrets.smtpPort.value : '',
    smtpSecure: smtpEnabled ? smtpSecrets.smtpSecure.value : '',
    senderEmailAddress: smtpEnabled ? smtpSecrets.senderEmailAddress.value : '',
    alertEmail: smtpEnabled ? smtpSecrets.alertEmail.value : '',
    backupRestoreMode: backupRestoreConfig.backupRestoreMode,
    backupHost:
      backupRestoreConfig.backupRestoreMode === 'backup'
        ? backupRestoreConfig.backupHost || ''
        : '',
    backupUser:
      backupRestoreConfig.backupRestoreMode === 'backup'
        ? backupRestoreConfig.backupUser || ''
        : '',
    backupType:
      backupRestoreConfig.backupRestoreMode === 'backup'
        ? backupRestoreConfig.backupType || ''
        : '',
    restoreEnvironmentName:
      backupRestoreConfig.backupRestoreMode === 'restore'
        ? backupRestoreConfig.restoreEnvironmentName || ''
        : '',
    restoreType:
      backupRestoreConfig.backupRestoreMode === 'restore'
        ? backupRestoreConfig.restoreType || ''
        : ''
  }

  return applicationConfig
}

function saveInfrastructureConfig(payload: InfrastructureRequest) {
  if (!hasDeploymentFeature('ansible')) {
    throw new Error('Infrastructure configuration is disabled for this setup type.')
  }

  if (!environmentSelection) {
    throw new Error('Select an environment before configuring infrastructure.')
  }

  if (payload.kubeApiAllowedCidrs && !validateCIDRs(payload.kubeApiAllowedCidrs)) {
    throw new Error('Allowed CIDRs must be valid comma-separated CIDR ranges.')
  }

  const enableDiskEncryption = hasDeploymentFeature('github') && (
    isExistingGithubEnvironment()
      ? Boolean(getEnvironmentVariableValue('DISK_SPACE'))
      : Boolean(payload.enableDiskEncryption)
  )

  if (enableDiskEncryption && !payload.diskSpace?.trim()) {
    throw new Error('Disk space is required when disk encryption is enabled.')
  }

  validateUsers(payload.users || [])
  users = payload.users || []

  infrastructureConfig = {
    kubeAPIHost: payload.kubeAPIHost?.trim() || '',
    kubeWorkerNodes: payload.kubeWorkerNodes?.trim() || '',
    kubeApiAllowedCidrs: payload.kubeApiAllowedCidrs?.trim() || '',
    enableDiskEncryption,
    diskSpace: enableDiskEncryption ? payload.diskSpace?.trim() || '' : '',
    users
  }

  return infrastructureConfig
}

function saveConfigurationScreen(
  screenId: string,
  payload: ConfigurationScreenRequest
) {
  const values = payload.values || {}

  if (screenId === 'infrastructure') {
    saveInfrastructureConfig({
      ...(values as InfrastructureRequest),
      users: payload.custom?.users || users
    })
    setScreenFieldValues(
      'infrastructure',
      getConfigurationFields('infrastructure'),
      Object.fromEntries(
        Object.entries(infrastructureConfig || {}).filter(
          ([, value]) => !Array.isArray(value)
        )
      ) as Record<string, ConfigurationValue>
    )
  } else if (screenId === 'application') {
    saveApplicationConfig(values as ApplicationRequest)
    setScreenFieldValues(
      'application',
      getGeneralScreenFields('application'),
      applicationConfig || {}
    )
    saveScreenFields(
      'application',
      getScreenFields('application', 'advanced'),
      values
    )
  } else if (screenId === 'dependencies') {
    saveDependenciesConfig({ values })
    setScreenFieldValues(
      'dependencies',
      getGeneralScreenFields('dependencies'),
      dependenciesConfig
    )
    saveScreenFields(
      'dependencies',
      getScreenFields('dependencies', 'advanced'),
      values
    )
  } else if (CONFIGURATION_SCREENS.some(({ id }) => id === screenId)) {
    saveGenericScreenConfig(screenId, values)
  } else {
    throw new Error(`Unknown configuration screen: ${screenId}`)
  }

  return getConfigurationScreenResponse(screenId)
}

function getCurrentSystemUser() {
  const username = os.userInfo().username
  const sshDir = path.join(os.homedir(), '.ssh')
  const keyFiles = ['id_rsa.pub', 'id_ecdsa.pub', 'id_ed25519.pub', 'id_dsa.pub']
  const sshKeys = keyFiles.flatMap((keyFile) => {
    const keyPath = path.join(sshDir, keyFile)

    try {
      if (!fs.existsSync(keyPath)) {
        return []
      }

      const key = fs.readFileSync(keyPath, 'utf8').trim()
      return key ? [key] : []
    } catch {
      return []
    }
  })

  return {
    name: username,
    ssh_keys: sshKeys,
    state: 'present' as const,
    role: 'admin' as const
  }
}

function getSessionResponse() {
  return {
    connected: Boolean(verifiedConnection),
    organisation: verifiedConnection?.organisation || '',
    repository: verifiedConnection?.repository || '',
    repositoryId,
    environmentChoices: getEnvironmentChoices(),
    existingEnvironments,
    repositoryVariableCount: repositoryVariables.length,
    repositorySecretCount: repositorySecrets.length,
    environmentVariableCount: environmentVariables.length,
    environmentSecretCount: environmentSecrets.length,
    existingSecrets: getExistingSecretState(),
    secretSentinel: EXISTING_SECRET_SENTINEL,
    githubApprovers: getRepositoryVariableValue('GH_APPROVERS'),
    setupOptions,
    deploymentFeatures: getDeploymentFeatures(),
    environmentSelection,
    users,
    infrastructure: infrastructureConfig,
    infrastructureFields: getConfigurationFields('infrastructure'),
    application: applicationConfig,
    applicationFields: getApplicationFields(),
    dependencies: getDependenciesResponse(),
    advanced: getAdvancedResponse(),
    configuration: getConfigurationResponse()
  }
}

function getEnvironmentSelectionResponse(
  selection: Required<EnvironmentSelectionRequest>
) {
  return {
    saved: true,
    environmentSelection: selection,
    setupOptions,
    deploymentFeatures: getDeploymentFeatures(),
    approvalRequired: selection.approvalRequired,
    environmentVariableCount: environmentVariables.length,
    environmentSecretCount: environmentSecrets.length,
    existingSecrets: getExistingSecretState(),
    secretSentinel: EXISTING_SECRET_SENTINEL,
    users,
    infrastructure: infrastructureConfig,
    infrastructureFields: getConfigurationFields('infrastructure'),
    application: applicationConfig,
    applicationFields: getApplicationFields(),
    dependencies: getDependenciesResponse(),
    advanced: getAdvancedResponse(),
    configuration: getConfigurationResponse()
  }
}

async function previewEnvironment(payload: { environmentName?: unknown }) {
  const environmentName =
    typeof payload.environmentName === 'string'
      ? payload.environmentName.trim()
      : ''

  if (!environmentName) {
    throw new Error('Environment name is required.')
  }

  if (!hasDeploymentFeature('github')) {
    return { approvalRequired: false }
  }

  await loadEnvironmentValues(environmentName)
  return {
    approvalRequired: getEnvironmentBooleanVariable('APPROVAL_REQUIRED')
  }
}

function createRequestHandler() {
  return createUiRequestHandler({
    host: HOST,
    uiDirectory: UI_DIRECTORY,
    bootstrapCss: BOOTSTRAP_CSS,
    currentSystemUserAvailable: CURRENT_SYSTEM_USER_AVAILABLE,
    getConfigurationSchemaScript: () =>
      `window.OpenCRVSConfigurationSchema = ${JSON.stringify(
        CONFIGURATION_SCREENS.slice().sort((left, right) => left.order - right.order)
      )};`,
    getGitHubDefaultsResponse: () => ({
      ...getGitHubDefaults(),
      setupOptions,
      deploymentFeatures: getDeploymentFeatures(),
      currentSystemUserAvailable: CURRENT_SYSTEM_USER_AVAILABLE
    }),
    saveSetupOptions: (payload) => {
      const options = saveSetupOptions(payload as SetupOptionsRequest)
      return {
        saved: true,
        setupOptions: options,
        configuration: environmentSelection ? getConfigurationResponse() : []
      }
    },
    getConfigurationSchemaResponse: () => ({
      screens: CONFIGURATION_SCREENS,
      fields: CONFIGURATION_FIELDS
    }),
    getSessionResponse,
    getCurrentSystemUser,
    verifyGitHubConnection: async (payload) => {
      await verifyGitHubConnection(payload as GitHubConnectionRequest)
    },
    getGitHubConnectionResponse,
    saveEnvironmentSelection: (payload) =>
      saveEnvironmentSelection(payload as EnvironmentSelectionRequest),
    getEnvironmentSelectionResponse: (selection) =>
      getEnvironmentSelectionResponse(selection as Required<EnvironmentSelectionRequest>),
    previewEnvironment,
    saveConfigurationScreen: (screenId, payload) =>
      saveConfigurationScreen(screenId, payload as ConfigurationScreenRequest),
    getConfigurationResponse,
    getHelmUpdates,
    saveInfrastructureConfig: (payload) =>
      saveInfrastructureConfig(payload as InfrastructureRequest) as Record<string, unknown>,
    getInventoryValues: (payload) =>
      getInventoryValues(payload as InfrastructureRequest),
    saveApplicationConfig: (payload) =>
      saveApplicationConfig(payload as ApplicationRequest) as Record<string, unknown>,
    getChartValues: (payload) => getChartValues(payload as ApplicationRequest),
    getApplicationGithubUpdates: (payload) =>
      getApplicationGithubUpdates(payload as ApplicationRequest),
    saveAdvancedConfig: (payload) => saveAdvancedConfig(payload as AdvancedRequest),
    saveDependenciesConfig: (payload) =>
      saveDependenciesConfig(payload as DependenciesRequest),
    assertReadyToFinalize,
    getReviewPlan: (includeSecretValues) => getReviewPlan(includeSecretValues),
    getValuesSecretsPath: () => lastValuesSecretsPath,
    finalizeSetup,
    resetConfiguratorSession
  })
}

function openBrowser(url: string) {
  const command =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'cmd'
        : 'xdg-open'

  const args: string[] =
    process.platform === 'win32'
      ? ['/c', 'start', '', url]
      : [url]

  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore'
  })
  child.unref()
}

export function startEnvironmentInitUi() {
  const server = http.createServer(createRequestHandler())

  server.listen(DEFAULT_PORT, HOST, () => {
    const address = server.address() as AddressInfo
    const url = `http://${PUBLIC_HOST}:${address.port}`

    console.log(`OpenCRVS environment setup is running at ${url}`)
    if (OPEN_BROWSER) {
      openBrowser(url)
    } else {
      console.log(`Open ${url} in your browser.`)
    }
  })
}

if (require.main === module) {
  startEnvironmentInitUi()
}
