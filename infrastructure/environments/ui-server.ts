import { spawn } from 'child_process'
import { randomInt } from 'crypto'
import fs from 'fs'
import http, { IncomingMessage, ServerResponse } from 'http'
import { AddressInfo } from 'net'
import os from 'os'
import path from 'path'
import { Octokit } from '@octokit/core'
import { dump as dumpYaml, load as loadYaml } from 'js-yaml'

import {
  CONFIGURATION_FIELDS,
  CONFIGURATION_SCREENS,
  ConfigurationField,
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

type ConfigurationValue = string | number | boolean

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

type HelmUpdate = {
  chart: HelmChart
  path: string
  value: ConfigurationValue
  action: 'remove' | 'set' | 'unchanged'
}

type User = {
  name: string
  ssh_keys: string[]
  state: 'present' | 'absent'
  role: 'admin' | 'operator'
}

type GithubUpdate = {
  scope: 'ENVIRONMENT' | 'REPOSITORY'
  type: 'VARIABLE' | 'SECRET'
  name: string
  value: string
  exists: boolean
  action: 'create' | 'update' | 'unchanged'
}

type JsonResponse = Record<string, unknown>

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
let advancedConfig: Record<string, ConfigurationValue> = {}
let dependenciesConfig: Record<string, ConfigurationValue> = {}
let genericScreenConfigs: Record<string, Record<string, ConfigurationValue>> = {}
const generatedFieldValues = new Map<string, string>()
let helmBaseOverrides: Partial<Record<HelmChart, Record<string, unknown>>> = {}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: JsonResponse
) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  })
  response.end(JSON.stringify(payload))
}

function sendUiFile(
  response: ServerResponse,
  filename: string,
  contentType: string
) {
  response.writeHead(200, {
    'content-type': `${contentType}; charset=utf-8`,
    'cache-control': 'no-store'
  })
  response.end(fs.readFileSync(path.join(UI_DIRECTORY, filename)))
}

function sendBootstrapCss(response: ServerResponse) {
  response.writeHead(200, {
    'content-type': 'text/css; charset=utf-8',
    'cache-control': 'public, max-age=86400'
  })
  response.end(fs.readFileSync(BOOTSTRAP_CSS))
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return Buffer.concat(chunks).toString('utf8')
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
  if (['development', 'qa'].includes(environmentName)) {
    return 'non-production'
  }

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

function getInfrastructureConfigFromGitHub(): InfrastructureRequest {
  const enableDiskEncryption = hasEnvironmentSecret('ENCRYPTION_KEY')

  return {
    kubeAPIHost: getEnvironmentVariableValue('KUBE_API_HOST'),
    kubeWorkerNodes: getEnvironmentVariableValue('KUBE_WORKER_NODES'),
    kubeApiAllowedCidrs: getEnvironmentVariableValue('KUBE_API_ALLOWED_CIDRS'),
    enableDiskEncryption,
    diskSpace: getEnvironmentVariableValue('DISK_SPACE') || '200g',
    users
  }
}

function getApplicationConfigFromGitHub(): ApplicationRequest {
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

  return {
    domain: getEnvironmentVariableValue('DOMAIN'),
    traefikMode: hasStaticSsl ? 'static_ssl' : 'lets_encrypt',
    sslCrt: '',
    sslKey: '',
    dockerhubMode:
      hasDockerhubAccount && hasDockerhubRepo && !hasDockerhubCredentials
        ? 'opencrvs'
        : 'custom',
    dockerhubOrganisation:
      hasDockerhubAccount && !hasDockerhubCredentials ? 'opencrvs' : '',
    dockerhubRepository:
      hasDockerhubRepo && !hasDockerhubCredentials ? 'ocrvs-countryconfig' : '',
    dockerhubUsername: '',
    dockerhubToken: '',
    smtpEnabled: hasSmtpConfiguration,
    smtpHost: '',
    smtpUsername: '',
    smtpPassword: '',
    smtpPort: '',
    smtpSecure: hasEnvironmentSecret('SMTP_SECURE') ? '' : false,
    senderEmailAddress: '',
    alertEmail: '',
    backupRestoreMode: backupHost
      ? 'backup'
      : restoreEnvironmentName
        ? 'restore'
        : 'none',
    backupHost,
    backupUser: hasEnvironmentSecret('BACKUP_SERVER_USER') ? '' : 'backup',
    backupType: getEnvironmentVariableValue('BACKUP_ENVIRONMENT_MODE') || 'dump',
    restoreEnvironmentName,
    restoreType: getEnvironmentVariableValue('RESTORE_ENVIRONMENT_MODE') || 'dump',
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getNestedValue(source: Record<string, unknown>, pathValue: string) {
  return pathValue.split('.').reduce<unknown>((current, segment) => {
    return isRecord(current) ? current[segment] : undefined
  }, source)
}

function setNestedValue(
  target: Record<string, unknown>,
  pathValue: string,
  value: ConfigurationValue
) {
  const segments = pathValue.split('.')
  const finalSegment = segments.pop()!
  let current = target

  for (const segment of segments) {
    if (!isRecord(current[segment])) {
      current[segment] = {}
    }
    current = current[segment] as Record<string, unknown>
  }

  current[finalSegment] = value
}

function deleteNestedValue(target: Record<string, unknown>, pathValue: string) {
  const segments = pathValue.split('.')

  function remove(current: Record<string, unknown>, index: number): boolean {
    const segment = segments[index]

    if (index === segments.length - 1) {
      delete current[segment]
    } else if (isRecord(current[segment])) {
      const child = current[segment] as Record<string, unknown>
      if (remove(child, index + 1)) {
        delete current[segment]
      }
    }

    return Object.keys(current).length === 0
  }

  remove(target, 0)
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

function loadAdvancedConfig(environmentName: string) {
  const advancedFields = getConfigurationFields('advanced')
  const charts = [...new Set(CONFIGURATION_FIELDS.flatMap((field) =>
    field.bindings
      .filter((binding): binding is HelmBinding => binding.target === 'helm')
      .map((binding) => binding.chart)
  ))]

  helmBaseOverrides = Object.fromEntries(
    charts.map((chart) => [chart, readHelmOverride(environmentName, chart)])
  )
  advancedConfig = Object.fromEntries(
    advancedFields.map((field) => {
      const source = field.source
      const override = source.target === 'helm'
        ? getNestedValue(helmBaseOverrides[source.chart] || {}, source.path)
        : source.target === 'github'
          ? secretExists(source.scope, source.name)
            ? ''
            : undefined
          : undefined
      const resolvedValue =
        typeof override === 'string' ||
        typeof override === 'number' ||
        typeof override === 'boolean'
          ? override
          : getFieldDefaultValue(field, environmentName)

      return [field.id, resolvedValue]
    })
  )
  loadDependenciesConfig(environmentName)
  loadGenericScreenConfigs(environmentName)
}

function generateCredential(kind: 'username' | 'password') {
  const characters = kind === 'username'
    ? 'abcdefghijklmnopqrstuvwxyz'
    : 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const length = kind === 'username' ? 8 : 16

  return Array.from(
    { length },
    () => characters[randomInt(characters.length)]
  ).join('')
}

function getFieldDefaultValue(field: ConfigurationField, environmentName = '') {
  if (field.generatedDefault) {
    const cacheKey = `${environmentName}:${field.id}`
    const existingValue = generatedFieldValues.get(cacheKey)
    if (existingValue) {
      return existingValue
    }

    const generatedValue = generateCredential(field.generatedDefault)
    generatedFieldValues.set(cacheKey, generatedValue)
    return generatedValue
  }

  if (typeof field.defaultValue === 'string' && environmentName) {
    return field.defaultValue.replace(
      'opencrvs-deps-dev',
      `opencrvs-deps-${environmentName}`
    )
  }

  return field.defaultValue ?? ''
}

function loadDependenciesConfig(environmentName: string) {
  dependenciesConfig = Object.fromEntries(
    getConfigurationFields('dependencies').map((field) => {
      const source = field.source
      let value: unknown

      if (source.target === 'helm') {
        value = getNestedValue(helmBaseOverrides[source.chart] || {}, source.path)
      } else if (
        source.target === 'github' &&
        source.scope === 'ENVIRONMENT' &&
        secretExists('ENVIRONMENT', source.name)
      ) {
        value = ''
      } else if (
        source.target === 'github' &&
        source.scope === 'REPOSITORY' &&
        secretExists('REPOSITORY', source.name)
      ) {
        value = ''
      }

      const resolvedValue =
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
          ? value
          : getFieldDefaultValue(field, environmentName)

      return [field.id, resolvedValue]
    })
  )
}

function loadGenericScreenConfigs(environmentName: string) {
  const specializedScreens = new Set([
    'infrastructure',
    'application',
    'dependencies',
    'advanced'
  ])

  genericScreenConfigs = Object.fromEntries(
    CONFIGURATION_SCREENS
      .filter(({ id }) => !specializedScreens.has(id))
      .map(({ id }) => [
        id,
        Object.fromEntries(
          getConfigurationFields(id).map((field) => {
            const source = field.source
            let value: unknown
            if (source.target === 'helm') {
              value = getNestedValue(helmBaseOverrides[source.chart] || {}, source.path)
            } else if (
              source.target === 'github' &&
              secretExists(source.scope, source.name)
            ) {
              value = ''
            } else if (source.target === 'github') {
              value = source.scope === 'ENVIRONMENT'
                ? getEnvironmentVariableValue(source.name)
                : getRepositoryVariableValue(source.name)
            }

            const resolvedValue =
              typeof value === 'string' ||
              typeof value === 'number' ||
              typeof value === 'boolean'
                ? value
                : getFieldDefaultValue(field, environmentName)
            return [field.id, resolvedValue]
          })
        )
      ])
  )
}

function getAdvancedResponse() {
  const fields = getConfigurationFields('advanced')
    .filter(isFieldEnabledForDeployment)
    .map(getFieldForCurrentDeployment)
  return {
    fields,
    values: advancedConfig,
    existingSecrets: Object.fromEntries(
      fields.map((field) => {
        const source = field.source
        return [
          field.id,
          source.target === 'github' && secretExists(source.scope, source.name)
        ]
      })
    )
  }
}

function getDependenciesResponse() {
  const fields = getConfigurationFields('dependencies')
    .filter(isFieldEnabledForDeployment)
    .map(getFieldForCurrentDeployment)
  return {
    fields,
    values: dependenciesConfig,
    existingSecrets: Object.fromEntries(
      fields.map((field) => {
        const source = field.source
        const exists = source.target === 'github' && source.scope === 'ENVIRONMENT'
          ? secretExists('ENVIRONMENT', source.name)
          : source.target === 'github' && source.scope === 'REPOSITORY'
            ? secretExists('REPOSITORY', source.name)
            : false
        return [field.id, exists]
      })
    ),
    secretSentinel: EXISTING_SECRET_SENTINEL
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
      : getConfigurationFields(screenId))
    .filter(isFieldEnabledForDeployment)
    .map(getFieldForCurrentDeployment)
  const existingSecrets = Object.fromEntries(
    fields.map((field) => {
      const source = field.source
      return [
        field.id,
        source.target === 'github' && secretExists(source.scope, source.name)
      ]
    })
  )
  const values = screenId === 'infrastructure'
    ? { ...(infrastructureConfig || {}) }
    : screenId === 'application'
      ? { ...(applicationConfig || {}) }
      : screenId === 'dependencies'
        ? { ...dependenciesConfig }
        : screenId === 'advanced'
          ? { ...advancedConfig }
          : { ...(genericScreenConfigs[screenId] || {}) }

  return {
    definition,
    fields,
    values,
    existingSecrets,
    secretSentinel: EXISTING_SECRET_SENTINEL,
    context: {
      environmentType: environmentSelection?.environmentType || 'non-production'
    },
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
    infrastructureConfig = getInfrastructureConfigFromGitHub()
    applicationConfig = getApplicationConfigFromGitHub()
    loadAdvancedConfig(environmentName)
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
  infrastructureConfig = getInfrastructureConfigFromGitHub()
  applicationConfig = getApplicationConfigFromGitHub()
  loadAdvancedConfig(environmentName)
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
  return {
    kube_api_host: config.kubeAPIHost || '',
    kube_worker_nodes: config.kubeWorkerNodes
      ? config.kubeWorkerNodes.split(',').map((host) => host.trim()).filter(Boolean)
      : [],
    backup_host:
      applicationConfig?.backupRestoreMode === 'backup'
        ? applicationConfig.backupHost || ''
        : '',
    users: config.users || []
  }
}

function getChartValues(config: ApplicationRequest) {
  const environment = environmentSelection?.environmentName || ''
  const environmentType = environmentSelection?.environmentType || 'non-production'

  return {
    env: environment,
    environment_type: environmentType,
    two_fa_enabled: environmentType !== 'production' ? false : true,
    backup_enabled: config.backupRestoreMode === 'backup',
    restore_enabled: config.backupRestoreMode === 'restore',
    restore_environment_name:
      config.backupRestoreMode === 'restore' ? config.restoreEnvironmentName || '' : '',
    restore_type: config.backupRestoreMode === 'restore' ? config.restoreType || 'dump' : '',
    traefik_mode: config.traefikMode || 'lets_encrypt',
    elastalert_notification_type:
      String(dependenciesConfig.elastalertNotificationType || 'email'),
    backup_type: config.backupRestoreMode === 'backup' ? config.backupType || 'dump' : '',
    lets_encrypt: config.traefikMode === 'lets_encrypt',
    static_ssl: config.traefikMode === 'static_ssl',
  }
}

function getApplicationGithubUpdates(config: ApplicationRequest) {
  const dockerhubSecrets =
    config.dockerhubMode === 'opencrvs'
      ? [
          { scope: 'REPOSITORY', type: 'SECRET', name: 'DOCKERHUB_ACCOUNT', value: 'opencrvs' },
          { scope: 'REPOSITORY', type: 'SECRET', name: 'DOCKERHUB_REPO', value: 'ocrvs-countryconfig' }
        ]
      : [
          { scope: 'REPOSITORY', type: 'SECRET', name: 'DOCKERHUB_ACCOUNT', value: config.dockerhubOrganisation || '' },
          { scope: 'REPOSITORY', type: 'SECRET', name: 'DOCKERHUB_REPO', value: config.dockerhubRepository || '' },
          { scope: 'REPOSITORY', type: 'SECRET', name: 'DOCKER_USERNAME', value: config.dockerhubUsername || '' },
          { scope: 'REPOSITORY', type: 'SECRET', name: 'DOCKER_TOKEN', value: config.dockerhubToken || '' }
        ]

  const sslSecrets =
    config.traefikMode === 'static_ssl'
      ? [
          { scope: 'ENVIRONMENT', type: 'SECRET', name: 'SSL_CRT', value: config.sslCrt || '' },
          { scope: 'ENVIRONMENT', type: 'SECRET', name: 'SSL_KEY', value: config.sslKey || '' }
        ]
      : []

  const smtpSecrets = config.smtpEnabled
    ? [
        { scope: 'ENVIRONMENT', type: 'SECRET', name: 'SMTP_HOST', value: config.smtpHost || '' },
        { scope: 'ENVIRONMENT', type: 'SECRET', name: 'SMTP_USERNAME', value: config.smtpUsername || '' },
        { scope: 'ENVIRONMENT', type: 'SECRET', name: 'SMTP_PASSWORD', value: config.smtpPassword || '' },
        { scope: 'ENVIRONMENT', type: 'SECRET', name: 'SMTP_PORT', value: config.smtpPort || '' },
        { scope: 'ENVIRONMENT', type: 'SECRET', name: 'SMTP_SECURE', value: String(config.smtpSecure ?? '') },
        { scope: 'ENVIRONMENT', type: 'SECRET', name: 'SENDER_EMAIL_ADDRESS', value: config.senderEmailAddress || '' },
        { scope: 'ENVIRONMENT', type: 'SECRET', name: 'ALERT_EMAIL', value: config.alertEmail || '' }
      ].filter((secret) => secret.value || hasEnvironmentSecret(secret.name))
    : []

  const backupSecrets = config.backupRestoreMode === 'backup'
    ? [
        {
          scope: 'ENVIRONMENT',
          type: 'SECRET',
          name: 'BACKUP_SERVER_USER',
          value: config.backupUser || ''
        }
      ]
    : []

  return {
    variables: [
      { scope: 'ENVIRONMENT', type: 'VARIABLE', name: 'DOMAIN', value: config.domain || '' }
    ],
    secrets: [
      ...dockerhubSecrets,
      ...sslSecrets,
      ...smtpSecrets,
      ...backupSecrets
    ]
  }
}

function variableExists(scope: 'ENVIRONMENT' | 'REPOSITORY', name: string) {
  const source = scope === 'ENVIRONMENT' ? environmentVariables : repositoryVariables
  return Boolean(source.find((variable) => variable.name === name))
}

function secretExists(scope: 'ENVIRONMENT' | 'REPOSITORY', name: string) {
  const source = scope === 'ENVIRONMENT' ? environmentSecrets : repositorySecrets
  return Boolean(source.find((secret) => secret.name === name))
}

function getExistingSecretState() {
  return {
    sslCrt: hasEnvironmentSecret('SSL_CRT'),
    sslKey: hasEnvironmentSecret('SSL_KEY'),
    dockerhubOrganisation: hasRepositorySecret('DOCKERHUB_ACCOUNT'),
    dockerhubRepository: hasRepositorySecret('DOCKERHUB_REPO'),
    dockerhubUsername: hasRepositorySecret('DOCKER_USERNAME'),
    dockerhubToken: hasRepositorySecret('DOCKER_TOKEN'),
    smtpHost: hasEnvironmentSecret('SMTP_HOST'),
    smtpUsername: hasEnvironmentSecret('SMTP_USERNAME'),
    smtpPassword: hasEnvironmentSecret('SMTP_PASSWORD'),
    smtpPort: hasEnvironmentSecret('SMTP_PORT'),
    smtpSecure: hasEnvironmentSecret('SMTP_SECURE'),
    senderEmailAddress: hasEnvironmentSecret('SENDER_EMAIL_ADDRESS'),
    alertEmail: hasEnvironmentSecret('ALERT_EMAIL'),
    kibanaUsername: hasEnvironmentSecret('KIBANA_USERNAME'),
    kibanaPassword: hasEnvironmentSecret('KIBANA_PASSWORD'),
    sentryDsn: hasEnvironmentSecret('SENTRY_DSN'),
    backupUser: hasEnvironmentSecret('BACKUP_SERVER_USER'),
    metabaseAdminEmail: hasEnvironmentSecret('OPENCRVS_METABASE_ADMIN_EMAIL'),
    metabaseAdminPassword: hasEnvironmentSecret(
      'OPENCRVS_METABASE_ADMIN_PASSWORD'
    )
  }
}

function getBackupRestoreState() {
  const environmentName = environmentSelection?.environmentName || ''
  const hasConfiguredBackupOrRestore = Boolean(
    getEnvironmentVariableValue('BACKUP_HOST') ||
    getEnvironmentVariableValue('RESTORE_ENVIRONMENT_NAME')
  )

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
      description: 'Disk encryption reflects the existing GitHub ENCRYPTION_KEY secret and cannot be changed here.'
    }
  })
}

function getApplicationFields() {
  const backupRestoreState = getBackupRestoreState()
  const backupRestoreMode = applicationConfig?.backupRestoreMode || 'none'

  return getConfigurationFields('application').map((field) => {
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

function planVariable(
  scope: 'ENVIRONMENT' | 'REPOSITORY',
  name: string,
  value: string
): GithubUpdate {
  const exists = variableExists(scope, name)

  return {
    scope,
    type: 'VARIABLE',
    name,
    value,
    exists,
    action: exists ? 'update' : 'create'
  }
}

function planSecret(
  scope: 'ENVIRONMENT' | 'REPOSITORY',
  name: string,
  value: string
): GithubUpdate {
  const exists = secretExists(scope, name)

  return {
    scope,
    type: 'SECRET',
    name,
    value,
    exists,
    action: value ? (exists ? 'update' : 'create') : exists ? 'unchanged' : 'create'
  }
}

function getGithubUpdates(includeSecretValues = false) {
  if (!hasDeploymentFeature('github') || !environmentSelection) {
    return {
      variables: [] as GithubUpdate[],
      secrets: [] as GithubUpdate[]
    }
  }

  const variables = [
    planVariable('ENVIRONMENT', 'APPROVAL_REQUIRED', environmentSelection.approvalRequired ? 'true' : 'false')
  ]

  if (applicationConfig?.domain) {
    variables.push(planVariable(
      'ENVIRONMENT',
      'CONTENT_SECURITY_POLICY_WILDCARD',
      `*.${applicationConfig.domain}`
    ))
  }

  if (environmentSelection.githubApprovers.trim()) {
    variables.unshift(
      planVariable(
        'REPOSITORY',
        'GH_APPROVERS',
        environmentSelection.githubApprovers
      )
    )
  }

  const configuredVariables = CONFIGURATION_FIELDS.flatMap((field) => {
    if (!isFieldEnabledForDeployment(field) || !isConfigurationFieldActive(field)) {
      return []
    }

    const value = String(getConfigurationFieldValue(field)).trim()

    return getActiveFieldBindings(field)
      .filter((binding): binding is GithubBinding =>
        binding.target === 'github' && binding.type === 'VARIABLE'
      )
      .flatMap((binding) => {
        if (binding.omitWhenEmpty && !value) {
          return []
        }

        return [planVariable(binding.scope, binding.name, value)]
      })
  })

  variables.push(...configuredVariables)

  const applicationUpdates = applicationConfig
    ? getApplicationGithubUpdates(applicationConfig)
    : { secrets: [] }
  const secrets = applicationUpdates.secrets.map((secret) =>
    planSecret(
      secret.scope as 'ENVIRONMENT' | 'REPOSITORY',
      secret.name,
      includeSecretValues ? secret.value : secret.value ? '[provided on submit]' : ''
    )
  )

  const githubToken = verifiedConnection?.token || ''
  secrets.push(
    planSecret(
      'REPOSITORY',
      'GH_TOKEN',
      includeSecretValues ? githubToken : githubToken ? '[provided at login]' : ''
    )
  )

  for (const field of getConfigurationFields('dependencies')) {
    if (!isFieldEnabledForDeployment(field) || !isConfigurationFieldActive(field)) {
      continue
    }

    for (const binding of getActiveFieldBindings(field)) {
      if (binding.target !== 'github' || binding.type !== 'SECRET') {
        continue
      }

      const value = String(dependenciesConfig[field.id] ?? '')
      secrets.push(
        planSecret(
          binding.scope,
          binding.name,
          includeSecretValues ? value : value ? '[provided on submit]' : ''
        )
      )
    }
  }

  for (const field of getConfigurationFields('advanced').filter(isFieldEnabledForDeployment)) {
    if (!isConfigurationFieldActive(field)) {
      continue
    }

    for (const binding of getActiveFieldBindings(field)) {
      if (binding.target !== 'github' || binding.type !== 'SECRET') {
        continue
      }

      const value = String(advancedConfig[field.id] ?? '')
      secrets.push(
        planSecret(
          binding.scope,
          binding.name,
          includeSecretValues ? value : value ? '[provided on submit]' : ''
        )
      )
    }
  }

  for (const definition of CONFIGURATION_SCREENS) {
    if (['infrastructure', 'application', 'dependencies', 'advanced'].includes(definition.id)) {
      continue
    }
    for (const field of getConfigurationFields(definition.id)) {
      if (!isFieldEnabledForDeployment(field) || !isConfigurationFieldActive(field)) {
        continue
      }
      for (const binding of getActiveFieldBindings(field)) {
        if (binding.target !== 'github' || binding.type !== 'SECRET') {
          continue
        }
        const value = String(genericScreenConfigs[definition.id]?.[field.id] ?? '')
        secrets.push(
          planSecret(
            binding.scope,
            binding.name,
            includeSecretValues ? value : value ? '[provided on submit]' : ''
          )
        )
      }
    }
  }

  if (applicationConfig?.backupRestoreMode === 'backup') {
    const passphraseExists = secretExists(
      'ENVIRONMENT',
      'BACKUP_ENCRYPTION_PASSPHRASE'
    )
    const privateKeyExists = secretExists('ENVIRONMENT', 'BACKUP_HOST_PRIVATE_KEY')
    const publicKeyExists = secretExists('ENVIRONMENT', 'BACKUP_HOST_PUBLIC_KEY')
    const needsBackupKeyPair = !privateKeyExists || !publicKeyExists

    if (includeSecretValues && !passphraseExists && !generatedBackupEncryptionPassphrase) {
      generatedBackupEncryptionPassphrase = generateLongPassword()
    }

    if (
      includeSecretValues &&
      needsBackupKeyPair &&
      !generatedBackupHostPrivateKey
    ) {
      const keyPair = generateSSHKeyPair()
      generatedBackupHostPrivateKey = keyPair.privateKey
      generatedBackupHostPublicKey = keyPair.publicKey
    }

    secrets.push(
      planSecret(
        'ENVIRONMENT',
        'BACKUP_ENCRYPTION_PASSPHRASE',
        passphraseExists
          ? ''
          : includeSecretValues
            ? generatedBackupEncryptionPassphrase
            : '[generated on finalize]'
      ),
      planSecret(
        'ENVIRONMENT',
        'BACKUP_HOST_PRIVATE_KEY',
        !needsBackupKeyPair
          ? ''
          : includeSecretValues
            ? generatedBackupHostPrivateKey
            : '[generated on finalize]'
      ),
      planSecret(
        'ENVIRONMENT',
        'BACKUP_HOST_PUBLIC_KEY',
        !needsBackupKeyPair
          ? ''
          : includeSecretValues
            ? generatedBackupHostPublicKey
            : '[generated on finalize]'
      )
    )
  }

  if (infrastructureConfig?.enableDiskEncryption) {
    const exists = secretExists('ENVIRONMENT', 'ENCRYPTION_KEY')

    if (!exists && includeSecretValues && !generatedEncryptionKey) {
      generatedEncryptionKey = generateLongPassword()
    }

    secrets.push(
      planSecret(
        'ENVIRONMENT',
        'ENCRYPTION_KEY',
        exists ? '' : includeSecretValues ? generatedEncryptionKey : '[generated on finalize]'
      )
    )
  }

  return {
    variables,
    secrets
  }
}

function getConfigurationFieldValue(field: ConfigurationField): ConfigurationValue {
  const configuredValues: Record<string, ConfigurationValue> = {
    kubeAPIHost: infrastructureConfig?.kubeAPIHost || '',
    kubeWorkerNodes: infrastructureConfig?.kubeWorkerNodes || '',
    kubeApiAllowedCidrs: infrastructureConfig?.kubeApiAllowedCidrs || '',
    enableDiskEncryption: Boolean(infrastructureConfig?.enableDiskEncryption),
    diskSpace: infrastructureConfig?.diskSpace || '200g',
    domain: applicationConfig?.domain || '',
    traefikMode: applicationConfig?.traefikMode || 'lets_encrypt',
    dockerhubMode: applicationConfig?.dockerhubMode || 'opencrvs',
    smtpEnabled: Boolean(applicationConfig?.smtpEnabled),
    backupRestoreMode: applicationConfig?.backupRestoreMode || 'none',
    backupHost: applicationConfig?.backupHost || '',
    backupType:
      applicationConfig?.backupRestoreMode === 'backup'
        ? applicationConfig.backupType || 'dump'
        : '',
    restoreEnvironmentName: applicationConfig?.restoreEnvironmentName || '',
    restoreType:
      applicationConfig?.backupRestoreMode === 'restore'
        ? applicationConfig.restoreType || 'dump'
        : ''
  }

  return configuredValues[field.id] ??
    dependenciesConfig[field.id] ??
    advancedConfig[field.id] ??
    genericScreenConfigs[field.screen]?.[field.id] ??
    field.defaultValue ??
    ''
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

function valuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function getHelmUpdates(): HelmUpdate[] {
  if (!hasDeploymentFeature('helm')) {
    return []
  }

  return CONFIGURATION_FIELDS.flatMap((field) => {
    if (!isFieldEnabledForDeployment(field)) {
      return []
    }

    const value = getConfigurationFieldValue(field)

    return getActiveFieldBindings(field)
      .filter((binding): binding is HelmBinding => binding.target === 'helm')
      .map((binding) => {
        const currentValue = getNestedValue(
          helmBaseOverrides[binding.chart] || {},
          binding.path
        )
        const shouldRemove =
          !isConfigurationFieldActive(field) ||
          Boolean(binding.omitWhenDefault && valuesEqual(value, field.defaultValue))
        const action = shouldRemove
          ? currentValue === undefined
            ? 'unchanged'
            : 'remove'
          : valuesEqual(currentValue, value)
            ? 'unchanged'
            : 'set'

        return {
          chart: binding.chart,
          path: binding.path,
          value,
          action
        }
      })
  })
}

function saveAdvancedConfig(payload: AdvancedRequest) {
  if (!environmentSelection) {
    throw new Error('Select an environment before configuring Helm values.')
  }

  const submittedValues = payload.values || {}
  const nextConfig: Record<string, ConfigurationValue> = {}

  for (const field of getConfigurationFields('advanced')) {
    const submitted = submittedValues[field.id]
    const current = advancedConfig[field.id] ?? field.defaultValue ?? ''

    if (field.control === 'checkbox') {
      nextConfig[field.id] = field.readonly || submitted === undefined
        ? Boolean(current)
        : Boolean(submitted)
      continue
    }

    const value = field.readonly || submitted === undefined ? current : submitted
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

  advancedConfig = nextConfig
  return getAdvancedResponse()
}

function saveDependenciesConfig(payload: DependenciesRequest) {
  if (!environmentSelection) {
    throw new Error('Select an environment before configuring dependencies.')
  }

  const submittedValues = payload.values || {}
  const fields = getConfigurationFields('dependencies').filter(isFieldEnabledForDeployment)
  const nextConfig: Record<string, ConfigurationValue> = { ...dependenciesConfig }

  for (const field of fields.filter(({ control }) => control === 'checkbox')) {
    const submitted = submittedValues[field.id]
    nextConfig[field.id] = field.readonly || submitted === undefined
      ? Boolean(dependenciesConfig[field.id] ?? field.defaultValue)
      : Boolean(submitted)
  }

  dependenciesConfig = nextConfig

  for (const field of fields.filter(({ control }) => control !== 'checkbox')) {
    if (!isConfigurationFieldActive(field)) {
      continue
    }

    const submitted = submittedValues[field.id]
    const value = field.readonly || submitted === undefined
      ? dependenciesConfig[field.id]
      : submitted
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

  dependenciesConfig = nextConfig
  return getDependenciesResponse()
}

function saveGenericScreenConfig(
  screenId: string,
  submittedValues: Record<string, unknown>
) {
  const fields = getConfigurationFields(screenId).filter(isFieldEnabledForDeployment)
  const currentConfig = genericScreenConfigs[screenId] || {}
  const nextConfig: Record<string, ConfigurationValue> = { ...currentConfig }

  for (const field of fields.filter(({ control }) => control === 'checkbox')) {
    const submitted = submittedValues[field.id]
    nextConfig[field.id] = field.readonly || submitted === undefined
      ? Boolean(currentConfig[field.id] ?? field.defaultValue)
      : Boolean(submitted)
  }
  genericScreenConfigs[screenId] = nextConfig

  for (const field of fields.filter(({ control }) => control !== 'checkbox')) {
    if (!isConfigurationFieldActive(field)) {
      continue
    }

    const submitted = submittedValues[field.id]
    const value = field.readonly || submitted === undefined
      ? currentConfig[field.id] ?? field.defaultValue ?? ''
      : submitted
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

  genericScreenConfigs[screenId] = nextConfig
}

function writeHelmOverrides(environmentName: string) {
  const updates = getHelmUpdates()
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

function getFilesToUpdate() {
  const environment = environmentSelection?.environmentName || '<environment>'
  const chartFiles = [
    'dependencies/values.yaml',
    'dependencies/values.override.yaml',
    'opencrvs-services/values.yaml',
    'opencrvs-services/values.override.yaml',
    'traefik/values.yaml',
    'traefik/values.override.yaml'
  ].map((file) => `environments/${environment}/${file}`)
  const inventoryFiles = hasDeploymentFeature('ansible')
    ? [`infrastructure/server-setup/inventory/${environment}.yml`]
    : []
  const workflowFiles = hasDeploymentFeature('github')
    ? [
        '.github/workflows/provision.yml',
        '.github/workflows/reset-2fa.yml',
        '.github/workflows/deploy-dependencies.yml',
        '.github/workflows/deploy-opencrvs.yml',
        '.github/workflows/clear-all-data.yml',
        '.github/workflows/seed-data.yml',
        '.github/workflows/reindex.yml',
        '.github/workflows/github-to-k8s-sync-env.yml'
      ]
    : []

  return [
    ...inventoryFiles,
    ...(hasDeploymentFeature('helm') ? chartFiles : []),
    ...workflowFiles
  ]
}

function getReviewPlan(includeSecretValues = false) {
  const githubUpdates = getGithubUpdates(includeSecretValues)

  return {
    files: getFilesToUpdate(),
    variables: githubUpdates.variables,
    secrets: includeSecretValues
      ? githubUpdates.secrets
      : githubUpdates.secrets.map(({ value, ...secret }) => secret),
    deploymentFeatures: getDeploymentFeatures(),
    inventoryValues: hasDeploymentFeature('ansible') && infrastructureConfig
      ? getInventoryValues(infrastructureConfig)
      : null,
    chartValues: hasDeploymentFeature('helm') && applicationConfig
      ? getChartValues(applicationConfig)
      : null,
    helmUpdates: getHelmUpdates()
  }
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

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

function getNextSteps() {
  if (!hasDeploymentFeature('ansible')) {
    return null
  }

  const organisation = verifiedConnection?.organisation || '<org name>'
  const repository = verifiedConnection?.repository || '<repo name>'
  const token = verifiedConnection?.token || '<github token>'
  const environment = environmentSelection!.environmentName
  const primaryHost = infrastructureConfig!.kubeAPIHost || 'KUBE_API_HOST'
  const workerNodes = (infrastructureConfig!.kubeWorkerNodes || '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean)
  const backupHost = applicationConfig!.backupRestoreMode === 'backup'
    ? applicationConfig!.backupHost || ''
    : ''

  return {
    primaryHost,
    primaryCommand: [
      'curl -sfL https://raw.githubusercontent.com/opencrvs/infrastructure/refs/heads/develop/scripts/bootstrap/opencrvs-bootstrap.sh \\',
      '     -o opencrvs-bootstrap.sh && \\',
      `bash opencrvs-bootstrap.sh --owner ${shellQuote(organisation)} \\`,
      `            --repo ${shellQuote(repository)} \\`,
      `            --env ${shellQuote(environment)} \\`,
      `            --token ${shellQuote(token)} \\`,
      '            --enable-runner'
    ].join('\n'),
    additionalHosts: [...new Set([...workerNodes, backupHost].filter(Boolean))],
    additionalCommand: [
      'curl -sfL https://raw.githubusercontent.com/opencrvs/infrastructure/refs/heads/develop/scripts/bootstrap/opencrvs-bootstrap.sh -o opencrvs-bootstrap.sh && \\',
      '    bash opencrvs-bootstrap.sh --ssh-public-key "<public key from master node>"'
    ].join('\n')
  }
}

async function applyGithubUpdate(octokit: Octokit, update: GithubUpdate) {
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

  if (update.type === 'SECRET' && update.action !== 'unchanged') {
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
    if (update.type === 'SECRET' && update.action === 'unchanged') {
      performedActions.push(`Skipped unchanged ${update.scope.toLowerCase()} secret ${update.name}`)
      continue
    }

    await applyGithubUpdate(octokit, update)
    performedActions.push(
      `${update.action === 'update' ? 'Updated' : 'Created'} ${update.scope.toLowerCase()} ${update.type.toLowerCase()} ${update.name}`
    )
  }

  return performedActions
}

async function finalizeSetup() {
  assertReadyToFinalize()

  const environment = environmentSelection!.environmentName
  const inventoryValues = infrastructureConfig
    ? getInventoryValues(infrastructureConfig)
    : null
  const chartValues = applicationConfig
    ? getChartValues(applicationConfig)
    : null
  const debugPlan = getReviewPlan(true)
  const githubUpdates = getGithubUpdates(true)
  const performedActions: string[] = []

  console.log('\nOpenCRVS environment:init GitHub debug payload')
  console.log(JSON.stringify(debugPlan, null, 2))

  if (hasDeploymentFeature('ansible') && inventoryValues) {
    generateInventory(environment, inventoryValues)
    performedActions.push(`Generated inventory file infrastructure/server-setup/inventory/${environment}.yml`)
  }

  if (hasDeploymentFeature('helm') && chartValues) {
    copyChartsValues(environment, chartValues as Record<string, string | boolean>)
    performedActions.push(`Generated Helm chart values under environments/${environment}`)
    writeHelmOverrides(environment)
    performedActions.push('Applied managed Helm chart overrides')
  }

  if (hasDeploymentFeature('github')) {
    await updateWorkflowEnvironments()
    performedActions.push('Updated GitHub workflow environment options')

    const octokit = new Octokit({ auth: verifiedConnection!.token })
    await createEnvironment(
      octokit,
      environment,
      verifiedConnection!.organisation!,
      verifiedConnection!.repository!
    )
    performedActions.push(`Created or updated GitHub environment ${environment}`)
    performedActions.push(
      ...(await applyGithubUpdates(octokit, [
        ...githubUpdates.variables,
        ...githubUpdates.secrets
      ]))
    )
  }

  return {
    ...getReviewPlan(false),
    performedActions,
    nextSteps: getNextSteps()
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

  const dockerhubMode = payload.dockerhubMode || 'opencrvs'
  const dockerhubOrganisation = parseSubmittedSecret(
    'REPOSITORY',
    'DOCKERHUB_ACCOUNT',
    payload.dockerhubOrganisation
  )
  const dockerhubRepository = parseSubmittedSecret(
    'REPOSITORY',
    'DOCKERHUB_REPO',
    payload.dockerhubRepository
  )
  const dockerhubUsername = parseSubmittedSecret(
    'REPOSITORY',
    'DOCKER_USERNAME',
    payload.dockerhubUsername
  )
  const dockerhubToken = parseSubmittedSecret(
    'REPOSITORY',
    'DOCKER_TOKEN',
    payload.dockerhubToken
  )

  if (hasDeploymentFeature('github') && isFieldIdEnabled('dockerhubMode') && dockerhubMode === 'custom') {
    const required = [
      dockerhubOrganisation,
      dockerhubRepository,
      dockerhubUsername,
      dockerhubToken
    ]

    if (required.some((secret) => !secret.available)) {
      throw new Error('All custom Docker Hub fields are required.')
    }
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

  const requestedBackupRestoreMode = ['backup', 'restore'].includes(
    payload.backupRestoreMode || ''
  )
    ? payload.backupRestoreMode as 'backup' | 'restore'
    : 'none'
  const persistedBackupRestoreMode = getEnvironmentVariableValue('BACKUP_HOST')
    ? 'backup'
    : getEnvironmentVariableValue('RESTORE_ENVIRONMENT_NAME')
      ? 'restore'
      : 'none'
  const backupRestoreLocked =
    persistedBackupRestoreMode !== 'none' &&
    existingEnvironments.includes(environmentSelection.environmentName)

  if (
    hasDeploymentFeature('github') &&
    backupRestoreLocked &&
    requestedBackupRestoreMode !== persistedBackupRestoreMode
  ) {
    throw new Error(
      'Backup or restore mode cannot be changed after it has been configured.'
    )
  }

  const backupUser = parseSubmittedSecret(
    'ENVIRONMENT',
    'BACKUP_SERVER_USER',
    payload.backupUser
  )
  const backupHost = payload.backupHost?.trim() || ''
  const backupType = payload.backupType === 'differential' ? 'differential' : 'dump'
  const restoreEnvironmentName = payload.restoreEnvironmentName?.trim() || ''
  const restoreType = payload.restoreType === 'differential' ? 'differential' : 'dump'

  if (
    hasDeploymentFeature('github') &&
    requestedBackupRestoreMode === 'backup' &&
    (!backupHost || !backupUser.available)
  ) {
    throw new Error('Backup host and backup server user are required for backups.')
  }

  if (hasDeploymentFeature('github') && requestedBackupRestoreMode === 'restore') {
    if (!restoreEnvironmentName) {
      throw new Error('Restore environment name is required for restore.')
    }
    if (restoreEnvironmentName === environmentSelection.environmentName) {
      throw new Error('An environment cannot restore a backup from itself.')
    }
  }

  const backupRestoreMode = hasDeploymentFeature('github')
    ? requestedBackupRestoreMode
    : 'none'

  applicationConfig = {
    domain: payload.domain?.trim() || '',
    traefikMode,
    sslCrt: traefikMode === 'static_ssl' ? sslCrt.value : '',
    sslKey: traefikMode === 'static_ssl' ? sslKey.value : '',
    dockerhubMode,
    dockerhubOrganisation:
      dockerhubMode === 'opencrvs' ? 'opencrvs' : dockerhubOrganisation.value,
    dockerhubRepository:
      dockerhubMode === 'opencrvs' ? 'ocrvs-countryconfig' : dockerhubRepository.value,
    dockerhubUsername: dockerhubMode === 'custom' ? dockerhubUsername.value : '',
    dockerhubToken: dockerhubMode === 'custom' ? dockerhubToken.value : '',
    smtpEnabled,
    smtpHost: smtpEnabled ? smtpSecrets.smtpHost.value : '',
    smtpUsername: smtpEnabled ? smtpSecrets.smtpUsername.value : '',
    smtpPassword: smtpEnabled ? smtpSecrets.smtpPassword.value : '',
    smtpPort: smtpEnabled ? smtpSecrets.smtpPort.value : '',
    smtpSecure: smtpEnabled ? smtpSecrets.smtpSecure.value : '',
    senderEmailAddress: smtpEnabled ? smtpSecrets.senderEmailAddress.value : '',
    alertEmail: smtpEnabled ? smtpSecrets.alertEmail.value : '',
    backupRestoreMode,
    backupHost: backupRestoreMode === 'backup' ? backupHost : '',
    backupUser: backupRestoreMode === 'backup' ? backupUser.value : '',
    backupType: backupRestoreMode === 'backup' ? backupType : '',
    restoreEnvironmentName:
      backupRestoreMode === 'restore' ? restoreEnvironmentName : '',
    restoreType: backupRestoreMode === 'restore' ? restoreType : ''
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
      ? hasEnvironmentSecret('ENCRYPTION_KEY')
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
  } else if (screenId === 'application') {
    saveApplicationConfig(values as ApplicationRequest)
  } else if (screenId === 'dependencies') {
    saveDependenciesConfig({ values })
  } else if (screenId === 'advanced') {
    saveAdvancedConfig({ values })
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

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse
) {
  try {
    const method = request.method || 'GET'
    const url = new URL(request.url || '/', `http://${HOST}`)

    if (method === 'GET' && url.pathname === '/') {
      sendUiFile(response, 'index.html', 'text/html')
      return
    }

    if (method === 'GET' && url.pathname === '/ui/styles.css') {
      sendUiFile(response, 'styles.css', 'text/css')
      return
    }

    if (method === 'GET' && url.pathname === '/ui/bootstrap.min.css') {
      sendBootstrapCss(response)
      return
    }

    if (method === 'GET' && url.pathname === '/ui/application.js') {
      sendUiFile(response, 'application.js', 'text/javascript')
      return
    }

    if (method === 'GET' && url.pathname === '/ui/form-renderer.js') {
      sendUiFile(response, 'form-renderer.js', 'text/javascript')
      return
    }

    if (method === 'GET' && url.pathname === '/ui/configuration-schema.js') {
      response.writeHead(200, {
        'content-type': 'text/javascript; charset=utf-8',
        'cache-control': 'no-store'
      })
      response.end(
        `window.OpenCRVSConfigurationSchema = ${JSON.stringify(
          CONFIGURATION_SCREENS.slice().sort((left, right) => left.order - right.order)
        )};`
      )
      return
    }

    if (method === 'GET' && url.pathname === '/api/github/defaults') {
      sendJson(response, 200, {
        ...getGitHubDefaults(),
        setupOptions,
        deploymentFeatures: getDeploymentFeatures(),
        currentSystemUserAvailable: CURRENT_SYSTEM_USER_AVAILABLE
      })
      return
    }

    if (method === 'POST' && url.pathname === '/api/setup-options') {
      const body = await readRequestBody(request)
      const payload = JSON.parse(body || '{}') as SetupOptionsRequest
      const options = saveSetupOptions(payload)

      sendJson(response, 200, {
        saved: true,
        setupOptions: options,
        configuration: environmentSelection ? getConfigurationResponse() : []
      })
      return
    }

    if (method === 'GET' && url.pathname === '/api/configuration-schema') {
      sendJson(response, 200, {
        screens: CONFIGURATION_SCREENS,
        fields: CONFIGURATION_FIELDS
      })
      return
    }

    if (method === 'GET' && url.pathname === '/api/session') {
      sendJson(response, 200, {
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
      })
      return
    }

    if (method === 'GET' && url.pathname === '/api/current-user') {
      if (!CURRENT_SYSTEM_USER_AVAILABLE) {
        sendJson(response, 404, {
          error: 'The current system user is not available in container mode.'
        })
        return
      }

      sendJson(response, 200, {
        user: getCurrentSystemUser()
      })
      return
    }

    if (method === 'POST' && url.pathname === '/api/github/connect') {
      const body = await readRequestBody(request)
      const payload = JSON.parse(body || '{}') as GitHubConnectionRequest
      await verifyGitHubConnection(payload)

      sendJson(response, 200, getGitHubConnectionResponse())
      return
    }

    if (method === 'POST' && url.pathname === '/api/environment-selection') {
      const body = await readRequestBody(request)
      const payload = JSON.parse(body || '{}') as EnvironmentSelectionRequest
      const selection = await saveEnvironmentSelection(payload)

      sendJson(response, 200, {
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
      })
      return
    }

    if (method === 'POST' && url.pathname === '/api/environment-preview') {
      const body = await readRequestBody(request)
      const payload = JSON.parse(body || '{}') as { environmentName?: string }
      const environmentName = payload.environmentName?.trim() || ''

      if (!environmentName) {
        throw new Error('Environment name is required.')
      }

      if (!hasDeploymentFeature('github')) {
        sendJson(response, 200, { approvalRequired: false })
        return
      }

      await loadEnvironmentValues(environmentName)
      sendJson(response, 200, {
        approvalRequired: getEnvironmentBooleanVariable('APPROVAL_REQUIRED')
      })
      return
    }

    const configurationRoute = url.pathname.match(/^\/api\/configuration\/([^/]+)$/)
    if (method === 'POST' && configurationRoute) {
      const body = await readRequestBody(request)
      const payload = JSON.parse(body || '{}') as ConfigurationScreenRequest
      const screen = saveConfigurationScreen(
        decodeURIComponent(configurationRoute[1]),
        payload
      )

      sendJson(response, 200, {
        saved: true,
        screen,
        helmUpdates: getHelmUpdates()
      })
      return
    }

    if (method === 'POST' && url.pathname === '/api/infrastructure') {
      const body = await readRequestBody(request)
      const payload = JSON.parse(body || '{}') as InfrastructureRequest
      const infrastructure = saveInfrastructureConfig(payload)

      sendJson(response, 200, {
        saved: true,
        infrastructure,
        inventoryValues: getInventoryValues(infrastructure)
      })
      return
    }

    if (method === 'POST' && url.pathname === '/api/application') {
      const body = await readRequestBody(request)
      const payload = JSON.parse(body || '{}') as ApplicationRequest
      const application = saveApplicationConfig(payload)

      sendJson(response, 200, {
        saved: true,
        application,
        chartValues: getChartValues(application),
        githubUpdates: getApplicationGithubUpdates(application)
      })
      return
    }

    if (method === 'POST' && url.pathname === '/api/advanced') {
      const body = await readRequestBody(request)
      const payload = JSON.parse(body || '{}') as AdvancedRequest
      const advanced = saveAdvancedConfig(payload)

      sendJson(response, 200, {
        saved: true,
        advanced,
        helmUpdates: getHelmUpdates()
      })
      return
    }

    if (method === 'POST' && url.pathname === '/api/dependencies') {
      const body = await readRequestBody(request)
      const payload = JSON.parse(body || '{}') as DependenciesRequest
      const dependencies = saveDependenciesConfig(payload)

      sendJson(response, 200, {
        saved: true,
        dependencies,
        helmUpdates: getHelmUpdates()
      })
      return
    }

    if (method === 'GET' && url.pathname === '/api/review') {
      assertReadyToFinalize()
      sendJson(response, 200, getReviewPlan(false))
      return
    }

    if (method === 'POST' && url.pathname === '/api/finalize') {
      const result = await finalizeSetup()
      sendJson(response, 200, {
        finalized: true,
        ...result
      })
      return
    }

    sendJson(response, 404, { error: 'Not found' })
  } catch (error) {
    sendJson(response, 400, {
      error: error instanceof Error ? error.message : 'Unexpected error'
    })
  }
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
  const server = http.createServer(handleRequest)

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
