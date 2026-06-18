import { spawn } from 'child_process'
import fs from 'fs'
import http, { IncomingMessage, ServerResponse } from 'http'
import { AddressInfo } from 'net'
import os from 'os'
import path from 'path'
import { Octokit } from '@octokit/core'

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
}

type EnvironmentSelectionRequest = {
  environmentName?: string
  customEnvironmentName?: string
  environmentType?: string
  approvalRequired?: boolean
  githubApprovers?: string
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

const HOST = '127.0.0.1'
const DEFAULT_PORT = Number(process.env.ENVIRONMENT_INIT_UI_PORT || 0)

let verifiedConnection: GitHubConnectionRequest | null = null
let infrastructureConfig: InfrastructureRequest | null = null
let repositoryId: number | null = null
let existingEnvironments: string[] = []
let repositoryVariables: Variable[] = []
let repositorySecrets: Secret[] = []
let environmentVariables: Variable[] = []
let environmentSecrets: Secret[] = []
let environmentSelection: Required<EnvironmentSelectionRequest> | null = null
let users: User[] = []
let applicationConfig: ApplicationRequest | null = null
let generatedEncryptionKey = ''

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

function sendHtml(response: ServerResponse) {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store'
  })
  response.end(renderAuthScreen())
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
    diskSpace: enableDiskEncryption ? getEnvironmentVariableValue('DISK_SPACE') : '',
    users
  }
}

function getApplicationConfigFromGitHub(): ApplicationRequest {
  const hasStaticSsl = hasEnvironmentSecret('SSL_CRT') || hasEnvironmentSecret('SSL_KEY')
  const hasDockerhubAccount = hasRepositorySecret('DOCKERHUB_ACCOUNT')
  const hasDockerhubRepo = hasRepositorySecret('DOCKERHUB_REPO')
  const hasDockerhubCredentials =
    hasRepositorySecret('DOCKER_USERNAME') || hasRepositorySecret('DOCKER_TOKEN')

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
    dockerhubToken: ''
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

async function loadEnvironmentValues(environmentName: string) {
  if (!verifiedConnection || !repositoryId) {
    throw new Error('Connect to GitHub before loading environment values.')
  }

  if (!existingEnvironments.includes(environmentName)) {
    environmentVariables = []
    environmentSecrets = []
    loadUsersFromInventory(environmentName)
    infrastructureConfig = getInfrastructureConfigFromGitHub()
    return
  }

  const octokit = new Octokit({ auth: verifiedConnection.token })

  environmentVariables = await listEnvironmentVariables(
    octokit,
    repositoryId,
    environmentName
  )
  environmentSecrets = await listEnvironmentSecrets(
    octokit,
    verifiedConnection.organisation!,
    repositoryId,
    environmentName
  )
  loadUsersFromInventory(environmentName)
  infrastructureConfig = getInfrastructureConfigFromGitHub()
  applicationConfig = getApplicationConfigFromGitHub()
}

async function saveEnvironmentSelection(payload: EnvironmentSelectionRequest) {
  if (!verifiedConnection) {
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
    approvalRequired: Boolean(payload.approvalRequired),
    githubApprovers: payload.githubApprovers?.trim() || ''
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
    backup_host: '',
    users: config.users || []
  }
}

function getChartValues(config: ApplicationRequest) {
  const environment = environmentSelection?.environmentName || ''
  const environmentType = environmentSelection?.environmentType || 'non-production'

  return {
    env: environment,
    environment_type: environmentType,
    two_fa_enabled: environment !== 'production' ? false : true,
    backup_enabled: false,
    restore_enabled: false,
    restore_environment_name: '',
    restore_type: '',
    traefik_mode: config.traefikMode || 'lets_encrypt',
    backup_type: '',
    lets_encrypt: config.traefikMode === 'lets_encrypt',
    static_ssl: config.traefikMode === 'static_ssl'
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

  return {
    variables: [
      { scope: 'ENVIRONMENT', type: 'VARIABLE', name: 'DOMAIN', value: config.domain || '' }
    ],
    secrets: [...dockerhubSecrets, ...sslSecrets]
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
  if (!environmentSelection || !infrastructureConfig || !applicationConfig) {
    return {
      variables: [] as GithubUpdate[],
      secrets: [] as GithubUpdate[]
    }
  }

  const variables = [
    planVariable('REPOSITORY', 'GH_APPROVERS', environmentSelection.githubApprovers),
    planVariable('ENVIRONMENT', 'APPROVAL_REQUIRED', environmentSelection.approvalRequired ? 'true' : 'false'),
    planVariable('ENVIRONMENT', 'KUBE_API_HOST', infrastructureConfig.kubeAPIHost || ''),
    planVariable('ENVIRONMENT', 'KUBE_WORKER_NODES', infrastructureConfig.kubeWorkerNodes || ''),
    planVariable('ENVIRONMENT', 'KUBE_API_ALLOWED_CIDRS', infrastructureConfig.kubeApiAllowedCidrs || ''),
    planVariable('ENVIRONMENT', 'DOMAIN', applicationConfig.domain || '')
  ]

  if (infrastructureConfig.enableDiskEncryption) {
    variables.push(planVariable('ENVIRONMENT', 'DISK_SPACE', infrastructureConfig.diskSpace || ''))
  }

  const applicationUpdates = getApplicationGithubUpdates(applicationConfig)
  const secrets = applicationUpdates.secrets.map((secret) =>
    planSecret(
      secret.scope as 'ENVIRONMENT' | 'REPOSITORY',
      secret.name,
      includeSecretValues ? secret.value : secret.value ? '[provided on submit]' : ''
    )
  )

  if (infrastructureConfig.enableDiskEncryption) {
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

  return [
    `infrastructure/server-setup/inventory/${environment}.yml`,
    ...chartFiles,
    '.github/workflows/provision.yml',
    '.github/workflows/reset-2fa.yml',
    '.github/workflows/deploy-dependencies.yml',
    '.github/workflows/deploy-opencrvs.yml',
    '.github/workflows/clear-all-data.yml',
    '.github/workflows/seed-data.yml',
    '.github/workflows/reindex.yml',
    '.github/workflows/github-to-k8s-sync-env.yml'
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
    inventoryValues: infrastructureConfig ? getInventoryValues(infrastructureConfig) : null,
    chartValues: applicationConfig ? getChartValues(applicationConfig) : null
  }
}

function assertReadyToFinalize() {
  if (!verifiedConnection || !repositoryId) {
    throw new Error('Connect to GitHub before finalizing setup.')
  }

  if (!environmentSelection) {
    throw new Error('Select an environment before finalizing setup.')
  }

  if (!infrastructureConfig) {
    throw new Error('Save infrastructure configuration before finalizing setup.')
  }

  if (!applicationConfig) {
    throw new Error('Save application configuration before finalizing setup.')
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
  const inventoryValues = getInventoryValues(infrastructureConfig!)
  const chartValues = getChartValues(applicationConfig!)
  const debugPlan = getReviewPlan(true)
  const githubUpdates = getGithubUpdates(true)
  const performedActions: string[] = []

  console.log('\nOpenCRVS environment:init GitHub debug payload')
  console.log(JSON.stringify(debugPlan, null, 2))

  generateInventory(environment, inventoryValues)
  performedActions.push(`Generated inventory file infrastructure/server-setup/inventory/${environment}.yml`)
  copyChartsValues(environment, chartValues as Record<string, string | boolean>)
  performedActions.push(`Generated Helm chart values under environments/${environment}`)
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

  return {
    ...getReviewPlan(false),
    performedActions
  }
}

function saveApplicationConfig(payload: ApplicationRequest) {
  if (!verifiedConnection) {
    throw new Error('Connect to GitHub before configuring application settings.')
  }

  if (!environmentSelection) {
    throw new Error('Select an environment before configuring application settings.')
  }

  if (!payload.domain?.trim()) {
    throw new Error('DOMAIN is required.')
  }

  const traefikMode = payload.traefikMode || 'lets_encrypt'

  if (traefikMode === 'static_ssl' && (!payload.sslCrt?.trim() || !payload.sslKey?.trim())) {
    throw new Error('SSL certificate and key are required for static SSL.')
  }

  const dockerhubMode = payload.dockerhubMode || 'opencrvs'

  if (dockerhubMode === 'custom') {
    const required = [
      payload.dockerhubOrganisation,
      payload.dockerhubRepository,
      payload.dockerhubUsername,
      payload.dockerhubToken
    ]

    if (required.some((value) => !value?.trim())) {
      throw new Error('All custom Docker Hub fields are required.')
    }
  }

  applicationConfig = {
    domain: payload.domain.trim(),
    traefikMode,
    sslCrt: traefikMode === 'static_ssl' ? payload.sslCrt?.trim() || '' : '',
    sslKey: traefikMode === 'static_ssl' ? payload.sslKey?.trim() || '' : '',
    dockerhubMode,
    dockerhubOrganisation:
      dockerhubMode === 'opencrvs' ? 'opencrvs' : payload.dockerhubOrganisation?.trim() || '',
    dockerhubRepository:
      dockerhubMode === 'opencrvs' ? 'ocrvs-countryconfig' : payload.dockerhubRepository?.trim() || '',
    dockerhubUsername: dockerhubMode === 'custom' ? payload.dockerhubUsername?.trim() || '' : '',
    dockerhubToken: dockerhubMode === 'custom' ? payload.dockerhubToken?.trim() || '' : ''
  }

  return applicationConfig
}

function saveInfrastructureConfig(payload: InfrastructureRequest) {
  if (!verifiedConnection) {
    throw new Error('Connect to GitHub before configuring infrastructure.')
  }

  if (!environmentSelection) {
    throw new Error('Select an environment before configuring infrastructure.')
  }

  if (payload.kubeApiAllowedCidrs && !validateCIDRs(payload.kubeApiAllowedCidrs)) {
    throw new Error('Allowed CIDRs must be valid comma-separated CIDR ranges.')
  }

  if (payload.enableDiskEncryption && !payload.diskSpace?.trim()) {
    throw new Error('Disk space is required when disk encryption is enabled.')
  }

  validateUsers(payload.users || [])
  users = payload.users || []

  infrastructureConfig = {
    kubeAPIHost: payload.kubeAPIHost?.trim() || '',
    kubeWorkerNodes: payload.kubeWorkerNodes?.trim() || '',
    kubeApiAllowedCidrs: payload.kubeApiAllowedCidrs?.trim() || '',
    enableDiskEncryption: Boolean(payload.enableDiskEncryption),
    diskSpace: payload.enableDiskEncryption ? payload.diskSpace?.trim() || '' : '',
    users
  }

  return infrastructureConfig
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
      sendHtml(response)
      return
    }

    if (method === 'GET' && url.pathname === '/api/github/defaults') {
      sendJson(response, 200, getGitHubDefaults())
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
        githubApprovers: getRepositoryVariableValue('GH_APPROVERS'),
        environmentSelection,
        users,
        infrastructure: infrastructureConfig,
        application: applicationConfig
      })
      return
    }

    if (method === 'GET' && url.pathname === '/api/current-user') {
      sendJson(response, 200, {
        user: getCurrentSystemUser()
      })
      return
    }

    if (method === 'POST' && url.pathname === '/api/github/connect') {
      const body = await readRequestBody(request)
      const payload = JSON.parse(body || '{}') as GitHubConnectionRequest
      const repositoryId = await verifyGitHubConnection(payload)

      sendJson(response, 200, {
        connected: true,
        repositoryId,
        organisation: payload.organisation,
        repository: payload.repository,
        environmentChoices: getEnvironmentChoices(),
        existingEnvironments,
        repositoryVariableCount: repositoryVariables.length,
        repositorySecretCount: repositorySecrets.length,
        githubApprovers: getRepositoryVariableValue('GH_APPROVERS')
      })
      return
    }

    if (method === 'POST' && url.pathname === '/api/environment-selection') {
      const body = await readRequestBody(request)
      const payload = JSON.parse(body || '{}') as EnvironmentSelectionRequest
      const selection = await saveEnvironmentSelection(payload)

      sendJson(response, 200, {
        saved: true,
        environmentSelection: selection,
        approvalRequired: getEnvironmentVariableValue('APPROVAL_REQUIRED'),
        environmentVariableCount: environmentVariables.length,
        environmentSecretCount: environmentSecrets.length,
        users,
        infrastructure: infrastructureConfig,
        application: applicationConfig
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

function renderAuthScreen() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OpenCRVS Environment Setup</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f7f9;
        --panel: #ffffff;
        --text: #17202a;
        --muted: #5b6775;
        --line: #d8dee6;
        --accent: #0969da;
        --accent-dark: #0759b8;
        --success-bg: #e8f7ef;
        --success: #137333;
        --error-bg: #fce8e6;
        --error: #b3261e;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
        background: var(--bg);
        color: var(--text);
      }

      main {
        width: min(960px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 40px 0;
      }

      .shell {
        display: grid;
        grid-template-columns: 280px minmax(0, 1fr);
        min-height: 680px;
        border: 1px solid var(--line);
        background: var(--panel);
      }

      aside {
        border-right: 1px solid var(--line);
        background: #eef2f6;
        padding: 28px 24px;
      }

      .brand {
        margin: 0 0 28px;
        font-size: 20px;
        font-weight: 700;
      }

      .steps {
        display: grid;
        gap: 10px;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .step {
        padding: 12px;
        border: 1px solid transparent;
        color: var(--muted);
        font-size: 14px;
      }

      .step.active {
        border-color: #b8c7dc;
        background: #ffffff;
        color: var(--text);
        font-weight: 650;
      }

      section {
        padding: 36px;
      }

      h1 {
        margin: 0 0 8px;
        font-size: 26px;
        line-height: 1.2;
      }

      .lede {
        max-width: 620px;
        margin: 0 0 28px;
        color: var(--muted);
        line-height: 1.5;
      }

      form {
        display: grid;
        gap: 18px;
        max-width: 620px;
      }

      label {
        display: grid;
        gap: 8px;
        font-size: 14px;
        font-weight: 650;
      }

      input {
        width: 100%;
        min-height: 44px;
        border: 1px solid var(--line);
        padding: 10px 12px;
        font: inherit;
        color: var(--text);
        background: #ffffff;
      }

      input:focus {
        outline: 2px solid rgba(9, 105, 218, 0.22);
        border-color: var(--accent);
      }

      .screen {
        display: none;
      }

      .screen.active {
        display: block;
      }

      .form-group {
        display: grid;
        gap: 12px;
      }

      .group-title {
        margin: 10px 0 0;
        padding-top: 8px;
        border-top: 1px solid var(--line);
        font-size: 16px;
      }

      .toggle {
        display: flex;
        align-items: center;
        gap: 10px;
        font-weight: 650;
      }

      .toggle input {
        width: 18px;
        min-height: 18px;
        accent-color: var(--accent);
      }

      select,
      textarea {
        width: 100%;
        min-height: 44px;
        border: 1px solid var(--line);
        padding: 10px 12px;
        font: inherit;
        color: var(--text);
        background: #ffffff;
      }

      textarea {
        min-height: 88px;
        resize: vertical;
      }

      select:focus,
      textarea:focus {
        outline: 2px solid rgba(9, 105, 218, 0.22);
        border-color: var(--accent);
      }

      .hidden {
        display: none;
      }

      .user-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .secondary {
        border-color: var(--line);
        color: var(--text);
        background: #ffffff;
      }

      .secondary:hover {
        background: #f4f6f8;
      }

      .danger {
        border-color: #b3261e;
        color: #ffffff;
        background: #b3261e;
      }

      .danger:hover {
        background: #921d18;
      }

      .users-table {
        width: 100%;
        border-collapse: collapse;
        border: 1px solid var(--line);
        font-size: 14px;
      }

      .users-table th,
      .users-table td {
        padding: 10px;
        border-bottom: 1px solid var(--line);
        text-align: left;
        vertical-align: top;
      }

      .users-table th {
        background: #f4f6f8;
        color: var(--muted);
        font-weight: 700;
      }

      .row-actions {
        display: flex;
        gap: 8px;
      }

      .inline-button {
        min-height: 34px;
        padding: 0 10px;
        font-size: 13px;
      }

      .editor-panel {
        display: grid;
        gap: 14px;
        padding: 16px;
        border: 1px solid var(--line);
        background: #fbfcfd;
      }

      .hint {
        color: var(--muted);
        font-size: 13px;
        font-weight: 400;
      }

      .actions {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 8px;
      }

      button {
        min-height: 44px;
        border: 1px solid var(--accent);
        padding: 0 18px;
        font: inherit;
        font-weight: 700;
        color: #ffffff;
        background: var(--accent);
        cursor: pointer;
      }

      button:hover {
        background: var(--accent-dark);
      }

      button:disabled {
        border-color: #aeb8c4;
        background: #aeb8c4;
        cursor: wait;
      }

      .status {
        display: none;
        max-width: 620px;
        margin-top: 20px;
        padding: 14px 16px;
        border: 1px solid transparent;
        line-height: 1.45;
      }

      .status.visible {
        display: block;
      }

      .status.success {
        border-color: #b7e1c9;
        background: var(--success-bg);
        color: var(--success);
      }

      .status.error {
        border-color: #f2b8b5;
        background: var(--error-bg);
        color: var(--error);
      }

      @media (max-width: 760px) {
        main {
          width: 100%;
          padding: 0;
        }

        .shell {
          min-height: 100vh;
          grid-template-columns: 1fr;
          border: 0;
        }

        aside {
          border-right: 0;
          border-bottom: 1px solid var(--line);
        }

        section {
          padding: 28px 20px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="shell">
        <aside>
          <p class="brand">OpenCRVS setup</p>
          <ol class="steps">
            <li class="step active">GitHub connection</li>
            <li class="step">Environment</li>
            <li class="step">Infrastructure</li>
            <li class="step">Application</li>
            <li class="step">Review</li>
          </ol>
        </aside>
        <section id="github-screen" class="screen active">
          <h1>Connect to GitHub</h1>
          <p class="lede">
            Confirm the infrastructure repository and verify access before
            generating environment configuration.
          </p>
          <form id="github-form">
            <label>
              Organisation
              <input id="organisation" name="organisation" autocomplete="organization" required />
            </label>
            <label>
              Repository
              <input id="repository" name="repository" autocomplete="off" required />
            </label>
            <label>
              GitHub token
              <input id="token" name="token" type="password" autocomplete="off" required />
              <span class="hint">
                Used only by this local setup process to verify repository access.
              </span>
            </label>
            <div class="actions">
              <button id="connect-button" type="submit">Test connection</button>
            </div>
          </form>
          <div id="status" class="status" role="status" aria-live="polite"></div>
        </section>
        <section id="environment-screen" class="screen">
          <h1>Environment</h1>
          <p class="lede">
            Choose the target GitHub environment and configure the repository
            approval settings used by deployment workflows.
          </p>
          <form id="environment-form">
            <label>
              Environment name
              <select id="environmentName" name="environmentName" required></select>
            </label>
            <label id="customEnvironmentField" class="hidden">
              Custom environment name
              <input id="customEnvironmentName" name="customEnvironmentName" autocomplete="off" />
            </label>
            <label>
              Environment type
              <select id="environmentType" name="environmentType" required>
                <option value="non-production">Development/Quality assurance/Testing (no PII data)</option>
                <option value="production">Staging/Production (hosts PII data, requires frequent backups)</option>
              </select>
            </label>
            <label class="toggle">
              <input id="approvalRequired" name="approvalRequired" type="checkbox" />
              Enable approvals for GitHub action workflows
            </label>
            <label>
              GH_APPROVERS
              <textarea id="githubApprovers" name="githubApprovers" autocomplete="off"></textarea>
              <span class="hint">Comma-separated GitHub usernames or teams.</span>
            </label>
            <div class="actions">
              <button id="environment-button" type="submit">Save environment</button>
            </div>
          </form>
          <div id="environment-status" class="status" role="status" aria-live="polite"></div>
        </section>
        <section id="infrastructure-screen" class="screen">
          <h1>Infrastructure</h1>
          <p class="lede">
            Configure the Kubernetes endpoint, worker nodes, API access ranges,
            and disk encryption settings for this environment.
          </p>
          <form id="infrastructure-form">
            <div class="form-group">
              <h2 class="group-title">Kubernetes</h2>
              <label>
                KUBE_API_HOST
                <input id="kubeAPIHost" name="kubeAPIHost" autocomplete="off" />
                <span class="hint">Leave empty to let the setup auto-detect the Kubernetes API endpoint.</span>
              </label>
              <label>
                KUBE_WORKER_NODES
                <input id="kubeWorkerNodes" name="kubeWorkerNodes" autocomplete="off" />
                <span class="hint">Comma-separated hostnames or IP addresses. Leave empty for a single-node setup.</span>
              </label>
              <label>
                KUBE_API_ALLOWED_CIDRS
                <input id="kubeApiAllowedCidrs" name="kubeApiAllowedCidrs" autocomplete="off" />
                <span class="hint">Comma-separated CIDR ranges, for example 10.0.0.0/24.</span>
              </label>
            </div>
            <div class="form-group">
              <h2 class="group-title">Disk Encryption</h2>
              <label class="toggle">
                <input id="enableDiskEncryption" name="enableDiskEncryption" type="checkbox" />
                Enable disk encryption
              </label>
              <label id="diskSpaceField" class="hidden">
                DISK_SPACE
                <input id="diskSpace" name="diskSpace" autocomplete="off" value="200g" />
                <span class="hint">Amount of disk space to dedicate to encrypted OpenCRVS data.</span>
              </label>
            </div>
            <div class="form-group">
              <h2 class="group-title">Users</h2>
              <div class="user-toolbar">
                <button id="add-user-button" class="secondary" type="button">Add user</button>
                <button id="add-current-user-button" class="secondary" type="button">Add current system user</button>
              </div>
              <table class="users-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Role</th>
                    <th>State</th>
                    <th>SSH keys</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="usersTableBody"></tbody>
              </table>
              <div id="user-editor" class="editor-panel hidden">
                <label>
                  Username
                  <input id="userName" autocomplete="off" />
                </label>
                <label>
                  Role
                  <select id="userRole">
                    <option value="admin">Admin (full OS and Kubernetes access)</option>
                    <option value="operator">Operator (read-only OS, full Kubernetes access)</option>
                  </select>
                </label>
                <label>
                  State
                  <select id="userState">
                    <option value="present">Present (allowed to log in)</option>
                    <option value="absent">Absent (account disabled)</option>
                  </select>
                </label>
                <label>
                  SSH public keys
                  <textarea id="userKeys"></textarea>
                  <span class="hint">One SSH public key per line.</span>
                </label>
                <div class="actions">
                  <button id="save-user-button" type="button">Save user</button>
                  <button id="cancel-user-button" class="secondary" type="button">Cancel</button>
                </div>
              </div>
            </div>
            <div class="actions">
              <button id="infrastructure-button" type="submit">Save infrastructure</button>
            </div>
          </form>
          <div id="infrastructure-status" class="status" role="status" aria-live="polite"></div>
        </section>
        <section id="application-screen" class="screen">
          <h1>Application</h1>
          <p class="lede">
            Configure OpenCRVS domain, Traefik TLS mode, and the country
            configuration Docker image source.
          </p>
          <form id="application-form">
            <div class="form-group">
              <h2 class="group-title">OpenCRVS</h2>
              <label>
                DOMAIN
                <input id="domain" name="domain" autocomplete="off" required />
                <span class="hint">Base domain used after OpenCRVS subdomains.</span>
              </label>
            </div>
            <div class="form-group">
              <h2 class="group-title">Traefik SSL Certificate</h2>
              <label>
                Certificate mode
                <select id="traefikMode" name="traefikMode">
                  <option value="lets_encrypt">Let's Encrypt certificate</option>
                  <option value="static_ssl">Static SSL certificate</option>
                  <option value="custom">Custom configuration</option>
                </select>
              </label>
              <div id="staticSslFields" class="form-group hidden">
                <label>
                  SSL_CRT
                  <textarea id="sslCrt" name="sslCrt"></textarea>
                </label>
                <label>
                  SSL_KEY
                  <textarea id="sslKey" name="sslKey"></textarea>
                </label>
              </div>
            </div>
            <div class="form-group">
              <h2 class="group-title">Docker Hub</h2>
              <label>
                Country config image source
                <select id="dockerhubMode" name="dockerhubMode">
                  <option value="opencrvs">Use Farajaland repository provided by OpenCRVS</option>
                  <option value="custom">Provide own repository</option>
                </select>
              </label>
              <div id="dockerhubOpencrvsInfo" class="hint">
                Will use DOCKERHUB_ACCOUNT=opencrvs and DOCKERHUB_REPO=ocrvs-countryconfig.
              </div>
              <div id="dockerhubCustomFields" class="form-group hidden">
                <label>
                  DOCKERHUB_ACCOUNT
                  <input id="dockerhubOrganisation" autocomplete="off" />
                </label>
                <label>
                  DOCKERHUB_REPO
                  <input id="dockerhubRepository" autocomplete="off" />
                </label>
                <label>
                  DOCKER_USERNAME
                  <input id="dockerhubUsername" autocomplete="off" />
                </label>
                <label>
                  DOCKER_TOKEN
                  <input id="dockerhubToken" type="password" autocomplete="off" />
                </label>
              </div>
            </div>
            <div class="actions">
              <button id="application-button" type="submit">Save application</button>
            </div>
          </form>
          <div id="application-status" class="status" role="status" aria-live="polite"></div>
        </section>
        <section id="review-screen" class="screen">
          <h1>Review</h1>
          <p class="lede">
            Review local files, GitHub variables, and GitHub secrets before
            generating files and creating or updating the GitHub environment.
          </p>
          <div class="form-group">
            <h2 class="group-title">Files to update</h2>
            <ul id="reviewFiles"></ul>
          </div>
          <div class="form-group">
            <h2 class="group-title">GitHub variables</h2>
            <table class="users-table">
              <thead>
                <tr>
                  <th>Scope</th>
                  <th>Name</th>
                  <th>Value</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody id="reviewVariables"></tbody>
            </table>
          </div>
          <div class="form-group">
            <h2 class="group-title">GitHub secrets</h2>
            <table class="users-table">
              <thead>
                <tr>
                  <th>Scope</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody id="reviewSecrets"></tbody>
            </table>
          </div>
          <div class="actions">
            <button id="finalize-button" type="button">Finalize setup</button>
          </div>
          <div id="finalize-summary" class="status success hidden"></div>
          <div id="review-status" class="status" role="status" aria-live="polite"></div>
        </section>
      </div>
    </main>
    <script>
      const form = document.querySelector('#github-form');
      const environmentForm = document.querySelector('#environment-form');
      const infrastructureForm = document.querySelector('#infrastructure-form');
      const applicationForm = document.querySelector('#application-form');
      const organisationInput = document.querySelector('#organisation');
      const repositoryInput = document.querySelector('#repository');
      const tokenInput = document.querySelector('#token');
      const button = document.querySelector('#connect-button');
      const environmentButton = document.querySelector('#environment-button');
      const infrastructureButton = document.querySelector('#infrastructure-button');
      const applicationButton = document.querySelector('#application-button');
      const finalizeButton = document.querySelector('#finalize-button');
      const statusBox = document.querySelector('#status');
      const environmentStatusBox = document.querySelector('#environment-status');
      const infrastructureStatusBox = document.querySelector('#infrastructure-status');
      const applicationStatusBox = document.querySelector('#application-status');
      const reviewStatusBox = document.querySelector('#review-status');
      const githubScreen = document.querySelector('#github-screen');
      const environmentScreen = document.querySelector('#environment-screen');
      const infrastructureScreen = document.querySelector('#infrastructure-screen');
      const applicationScreen = document.querySelector('#application-screen');
      const reviewScreen = document.querySelector('#review-screen');
      const steps = Array.from(document.querySelectorAll('.step'));
      const environmentNameInput = document.querySelector('#environmentName');
      const customEnvironmentField = document.querySelector('#customEnvironmentField');
      const customEnvironmentNameInput = document.querySelector('#customEnvironmentName');
      const environmentTypeInput = document.querySelector('#environmentType');
      const approvalRequiredInput = document.querySelector('#approvalRequired');
      const githubApproversInput = document.querySelector('#githubApprovers');
      const enableDiskEncryptionInput = document.querySelector('#enableDiskEncryption');
      const diskSpaceField = document.querySelector('#diskSpaceField');
      const diskSpaceInput = document.querySelector('#diskSpace');
      const kubeAPIHostInput = document.querySelector('#kubeAPIHost');
      const kubeWorkerNodesInput = document.querySelector('#kubeWorkerNodes');
      const kubeApiAllowedCidrsInput = document.querySelector('#kubeApiAllowedCidrs');
      const usersTableBody = document.querySelector('#usersTableBody');
      const addUserButton = document.querySelector('#add-user-button');
      const addCurrentUserButton = document.querySelector('#add-current-user-button');
      const userEditor = document.querySelector('#user-editor');
      const userNameInput = document.querySelector('#userName');
      const userRoleInput = document.querySelector('#userRole');
      const userStateInput = document.querySelector('#userState');
      const userKeysInput = document.querySelector('#userKeys');
      const saveUserButton = document.querySelector('#save-user-button');
      const cancelUserButton = document.querySelector('#cancel-user-button');
      const domainInput = document.querySelector('#domain');
      const traefikModeInput = document.querySelector('#traefikMode');
      const staticSslFields = document.querySelector('#staticSslFields');
      const sslCrtInput = document.querySelector('#sslCrt');
      const sslKeyInput = document.querySelector('#sslKey');
      const dockerhubModeInput = document.querySelector('#dockerhubMode');
      const dockerhubOpencrvsInfo = document.querySelector('#dockerhubOpencrvsInfo');
      const dockerhubCustomFields = document.querySelector('#dockerhubCustomFields');
      const dockerhubOrganisationInput = document.querySelector('#dockerhubOrganisation');
      const dockerhubRepositoryInput = document.querySelector('#dockerhubRepository');
      const dockerhubUsernameInput = document.querySelector('#dockerhubUsername');
      const dockerhubTokenInput = document.querySelector('#dockerhubToken');
      const reviewFiles = document.querySelector('#reviewFiles');
      const reviewVariables = document.querySelector('#reviewVariables');
      const reviewSecrets = document.querySelector('#reviewSecrets');
      const finalizeSummary = document.querySelector('#finalize-summary');
      let users = [];
      let editingUserIndex = null;

      function showStatus(type, message) {
        statusBox.className = 'status visible ' + type;
        statusBox.textContent = message;
      }

      function showInfrastructureStatus(type, message) {
        infrastructureStatusBox.className = 'status visible ' + type;
        infrastructureStatusBox.textContent = message;
      }

      function showApplicationStatus(type, message) {
        applicationStatusBox.className = 'status visible ' + type;
        applicationStatusBox.textContent = message;
      }

      function showReviewStatus(type, message) {
        reviewStatusBox.className = 'status visible ' + type;
        reviewStatusBox.textContent = message;
      }

      function showEnvironmentStatus(type, message) {
        environmentStatusBox.className = 'status visible ' + type;
        environmentStatusBox.textContent = message;
      }

      function showScreen(screenName) {
        githubScreen.classList.toggle('active', screenName === 'github');
        environmentScreen.classList.toggle('active', screenName === 'environment');
        infrastructureScreen.classList.toggle('active', screenName === 'infrastructure');
        applicationScreen.classList.toggle('active', screenName === 'application');
        reviewScreen.classList.toggle('active', screenName === 'review');
        steps[0].classList.toggle('active', screenName === 'github');
        steps[1].classList.toggle('active', screenName === 'environment');
        steps[2].classList.toggle('active', screenName === 'infrastructure');
        steps[3].classList.toggle('active', screenName === 'application');
        steps[4].classList.toggle('active', screenName === 'review');
      }

      function syncDiskEncryptionFields() {
        const enabled = enableDiskEncryptionInput.checked;
        diskSpaceField.classList.toggle('hidden', !enabled);
        diskSpaceInput.required = enabled;
      }

      function syncApplicationFields() {
        const usesStaticSsl = traefikModeInput.value === 'static_ssl';
        const usesCustomDockerhub = dockerhubModeInput.value === 'custom';

        staticSslFields.classList.toggle('hidden', !usesStaticSsl);
        sslCrtInput.required = usesStaticSsl;
        sslKeyInput.required = usesStaticSsl;
        dockerhubOpencrvsInfo.classList.toggle('hidden', usesCustomDockerhub);
        dockerhubCustomFields.classList.toggle('hidden', !usesCustomDockerhub);
        dockerhubOrganisationInput.required = usesCustomDockerhub;
        dockerhubRepositoryInput.required = usesCustomDockerhub;
        dockerhubUsernameInput.required = usesCustomDockerhub;
        dockerhubTokenInput.required = usesCustomDockerhub;
      }

      function renderUsers() {
        usersTableBody.innerHTML = '';

        if (users.length === 0) {
          const row = document.createElement('tr');
          row.innerHTML = '<td colspan="5">No users configured.</td>';
          usersTableBody.appendChild(row);
          return;
        }

        users.forEach((user, index) => {
          const row = document.createElement('tr');
          row.innerHTML = [
            '<td>' + user.name + '</td>',
            '<td>' + user.role + '</td>',
            '<td>' + user.state + '</td>',
            '<td>' + (user.ssh_keys || []).length + '</td>',
            '<td><div class="row-actions">' +
              '<button class="secondary inline-button" type="button" data-action="edit" data-index="' + index + '">Edit</button>' +
              '<button class="danger inline-button" type="button" data-action="remove" data-index="' + index + '">Remove</button>' +
            '</div></td>'
          ].join('');
          usersTableBody.appendChild(row);
        });
      }

      function openUserEditor(user, index) {
        editingUserIndex = index;
        userNameInput.value = user?.name || '';
        userNameInput.disabled = index !== null;
        userRoleInput.value = user?.role || 'operator';
        userStateInput.value = user?.state || 'present';
        userKeysInput.value = (user?.ssh_keys || []).join('\\n');
        userEditor.classList.remove('hidden');
      }

      function closeUserEditor() {
        editingUserIndex = null;
        userEditor.classList.add('hidden');
      }

      function parseUserKeys() {
        return userKeysInput.value
          .split('\\n')
          .map((key) => key.trim())
          .filter((key) => key && !key.startsWith('#'));
      }

      function validateUserInput(nextUser) {
        if (!nextUser.name) {
          throw new Error('Username required.');
        }

        if (!/^[a-z_][a-z0-9_-]*[$]?$/.test(nextUser.name)) {
          throw new Error('Invalid username format.');
        }

        const duplicate = users.find((user, index) => {
          return user.name === nextUser.name && index !== editingUserIndex;
        });

        if (duplicate) {
          throw new Error('User "' + nextUser.name + '" already exists.');
        }
      }

      function inferEnvironmentType(environmentName) {
        if (environmentName === 'staging' || environmentName === 'production') {
          return 'production';
        }

        return 'non-production';
      }

      function syncCustomEnvironmentField() {
        const isCustom = environmentNameInput.value === '__custom__';
        customEnvironmentField.classList.toggle('hidden', !isCustom);
        customEnvironmentNameInput.required = isCustom;
        if (!isCustom) {
          environmentTypeInput.value = inferEnvironmentType(environmentNameInput.value);
        }
      }

      function populateEnvironmentScreen(result) {
        const choices = result.environmentChoices || [];
        environmentNameInput.innerHTML = '';

        for (const choice of choices) {
          const option = document.createElement('option');
          option.value = choice.value;
          option.textContent = choice.name;
          environmentNameInput.appendChild(option);
        }

        const customOption = document.createElement('option');
        customOption.value = '__custom__';
        customOption.textContent = 'Custom environment';
        environmentNameInput.appendChild(customOption);

        githubApproversInput.value = result.githubApprovers || '';
        approvalRequiredInput.checked = false;
        syncCustomEnvironmentField();
      }

      function populateInfrastructureScreen(infrastructure) {
        const values = infrastructure || {};

        kubeAPIHostInput.value = values.kubeAPIHost || '';
        kubeWorkerNodesInput.value = values.kubeWorkerNodes || '';
        kubeApiAllowedCidrsInput.value = values.kubeApiAllowedCidrs || '';
        enableDiskEncryptionInput.checked = Boolean(values.enableDiskEncryption);
        diskSpaceInput.value = values.diskSpace || '200g';
        users = Array.isArray(values.users) ? values.users : [];
        renderUsers();
        syncDiskEncryptionFields();
      }

      function populateApplicationScreen(application) {
        const values = application || {};

        domainInput.value = values.domain || '';
        traefikModeInput.value = values.traefikMode || 'lets_encrypt';
        sslCrtInput.value = values.sslCrt || '';
        sslKeyInput.value = values.sslKey || '';
        dockerhubModeInput.value = values.dockerhubMode || 'opencrvs';
        dockerhubOrganisationInput.value = values.dockerhubOrganisation || '';
        dockerhubRepositoryInput.value = values.dockerhubRepository || '';
        dockerhubUsernameInput.value = values.dockerhubUsername || '';
        dockerhubTokenInput.value = values.dockerhubToken || '';
        syncApplicationFields();
      }

      function renderReview(plan) {
        reviewFiles.innerHTML = '';
        reviewVariables.innerHTML = '';
        reviewSecrets.innerHTML = '';

        for (const file of plan.files || []) {
          const item = document.createElement('li');
          item.textContent = file;
          reviewFiles.appendChild(item);
        }

        for (const variable of plan.variables || []) {
          const row = document.createElement('tr');
          row.innerHTML = [
            '<td>' + variable.scope + '</td>',
            '<td>' + variable.name + '</td>',
            '<td>' + variable.value + '</td>',
            '<td>' + variable.action + '</td>'
          ].join('');
          reviewVariables.appendChild(row);
        }

        for (const secret of plan.secrets || []) {
          const row = document.createElement('tr');
          const status = secret.exists ? 'Exists in GitHub' : 'Missing in GitHub';
          row.innerHTML = [
            '<td>' + secret.scope + '</td>',
            '<td>' + secret.name + '</td>',
            '<td>' + status + '</td>',
            '<td>' + secret.action + '</td>'
          ].join('');
          reviewSecrets.appendChild(row);
        }
      }

      function renderFinalizeSummary(actions) {
        const performedActions = actions || [];
        finalizeSummary.classList.remove('hidden');
        finalizeSummary.innerHTML = '<strong>Performed actions</strong><ul>' +
          performedActions.map((action) => '<li>' + action + '</li>').join('') +
          '</ul>';
      }

      async function loadReview() {
        const response = await fetch('/api/review');
        const plan = await response.json();

        if (!response.ok) {
          throw new Error(plan.error || 'Could not load review plan.');
        }

        renderReview(plan);
      }

      async function loadDefaults() {
        const response = await fetch('/api/github/defaults');
        const defaults = await response.json();

        organisationInput.value = defaults.organisation || '';
        repositoryInput.value = defaults.repository || '';
      }

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        button.disabled = true;
        button.textContent = 'Testing...';
        showStatus('', 'Checking repository access...');

        try {
          const response = await fetch('/api/github/connect', {
            method: 'POST',
            headers: {
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              organisation: organisationInput.value.trim(),
              repository: repositoryInput.value.trim(),
              token: tokenInput.value.trim()
            })
          });
          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.error || 'GitHub connection failed.');
          }

          showStatus(
            'success',
            'Connected to ' + result.organisation + '/' + result.repository + '.'
          );
          populateEnvironmentScreen(result);
          showScreen('environment');
        } catch (error) {
          showStatus('error', error.message || 'GitHub connection failed.');
        } finally {
          button.disabled = false;
          button.textContent = 'Test connection';
        }
      });

      environmentForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        environmentButton.disabled = true;
        environmentButton.textContent = 'Saving...';
        showEnvironmentStatus('', 'Saving environment selection...');

        try {
          const response = await fetch('/api/environment-selection', {
            method: 'POST',
            headers: {
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              environmentName: environmentNameInput.value,
              customEnvironmentName: customEnvironmentNameInput.value.trim(),
              environmentType: environmentTypeInput.value,
              approvalRequired: approvalRequiredInput.checked,
              githubApprovers: githubApproversInput.value.trim()
            })
          });
          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.error || 'Environment selection failed.');
          }

          if (result.approvalRequired) {
            approvalRequiredInput.checked = result.approvalRequired === 'true';
          }
          populateInfrastructureScreen(result.infrastructure);
          populateApplicationScreen(result.application);
          showEnvironmentStatus('success', 'Environment selection saved.');
          showScreen('infrastructure');
        } catch (error) {
          showEnvironmentStatus('error', error.message || 'Environment selection failed.');
        } finally {
          environmentButton.disabled = false;
          environmentButton.textContent = 'Save environment';
        }
      });

      infrastructureForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        infrastructureButton.disabled = true;
        infrastructureButton.textContent = 'Saving...';
        showInfrastructureStatus('', 'Saving infrastructure configuration...');

        try {
          const response = await fetch('/api/infrastructure', {
            method: 'POST',
            headers: {
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              kubeAPIHost: kubeAPIHostInput.value.trim(),
              kubeWorkerNodes: kubeWorkerNodesInput.value.trim(),
              kubeApiAllowedCidrs: kubeApiAllowedCidrsInput.value.trim(),
              enableDiskEncryption: enableDiskEncryptionInput.checked,
              diskSpace: diskSpaceInput.value.trim(),
              users
            })
          });
          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.error || 'Infrastructure configuration failed.');
          }

          showInfrastructureStatus('success', 'Infrastructure configuration saved.');
          showScreen('application');
        } catch (error) {
          showInfrastructureStatus('error', error.message || 'Infrastructure configuration failed.');
        } finally {
          infrastructureButton.disabled = false;
          infrastructureButton.textContent = 'Save infrastructure';
        }
      });

      applicationForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        applicationButton.disabled = true;
        applicationButton.textContent = 'Saving...';
        showApplicationStatus('', 'Saving application configuration...');

        try {
          const response = await fetch('/api/application', {
            method: 'POST',
            headers: {
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              domain: domainInput.value.trim(),
              traefikMode: traefikModeInput.value,
              sslCrt: sslCrtInput.value.trim(),
              sslKey: sslKeyInput.value.trim(),
              dockerhubMode: dockerhubModeInput.value,
              dockerhubOrganisation: dockerhubOrganisationInput.value.trim(),
              dockerhubRepository: dockerhubRepositoryInput.value.trim(),
              dockerhubUsername: dockerhubUsernameInput.value.trim(),
              dockerhubToken: dockerhubTokenInput.value.trim()
            })
          });
          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.error || 'Application configuration failed.');
          }

          showApplicationStatus('success', 'Application configuration saved.');
          await loadReview();
          showScreen('review');
        } catch (error) {
          showApplicationStatus('error', error.message || 'Application configuration failed.');
        } finally {
          applicationButton.disabled = false;
          applicationButton.textContent = 'Save application';
        }
      });

      finalizeButton.addEventListener('click', async () => {
        finalizeButton.disabled = true;
        finalizeButton.textContent = 'Finalizing...';
        showReviewStatus('', 'Generating files and updating GitHub environment...');

        try {
          const response = await fetch('/api/finalize', {
            method: 'POST'
          });
          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.error || 'Finalize failed.');
          }

          renderReview(result);
          renderFinalizeSummary(result.performedActions);
          finalizeButton.classList.add('hidden');
          showReviewStatus('success', 'Setup finalized. Debug GitHub payload was printed to the terminal.');
        } catch (error) {
          showReviewStatus('error', error.message || 'Finalize failed.');
          finalizeButton.disabled = false;
          finalizeButton.textContent = 'Finalize setup';
        } finally {
        }
      });

      usersTableBody.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button) {
          return;
        }

        const index = Number(button.dataset.index);
        const action = button.dataset.action;

        if (action === 'edit') {
          openUserEditor(users[index], index);
        }

        if (action === 'remove') {
          users.splice(index, 1);
          renderUsers();
          closeUserEditor();
        }
      });

      addUserButton.addEventListener('click', () => {
        openUserEditor({
          name: '',
          ssh_keys: [],
          state: 'present',
          role: 'operator'
        }, null);
      });

      addCurrentUserButton.addEventListener('click', async () => {
        try {
          const response = await fetch('/api/current-user');
          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.error || 'Could not load current system user.');
          }

          if (!result.user.ssh_keys.length) {
            showInfrastructureStatus('error', 'No SSH public keys found for the current system user.');
            return;
          }

          if (users.some((user) => user.name === result.user.name)) {
            showInfrastructureStatus('error', 'Current system user already exists.');
            return;
          }

          users.push(result.user);
          renderUsers();
          showInfrastructureStatus('success', 'Current system user added.');
        } catch (error) {
          showInfrastructureStatus('error', error.message || 'Could not load current system user.');
        }
      });

      saveUserButton.addEventListener('click', () => {
        try {
          const nextUser = {
            name: userNameInput.value.trim(),
            ssh_keys: parseUserKeys(),
            state: userStateInput.value,
            role: userRoleInput.value
          };

          validateUserInput(nextUser);

          if (editingUserIndex === null) {
            users.push(nextUser);
          } else {
            users[editingUserIndex] = nextUser;
          }

          renderUsers();
          closeUserEditor();
          showInfrastructureStatus('success', 'User saved.');
        } catch (error) {
          showInfrastructureStatus('error', error.message || 'Could not save user.');
        }
      });

      cancelUserButton.addEventListener('click', closeUserEditor);

      environmentNameInput.addEventListener('change', syncCustomEnvironmentField);
      enableDiskEncryptionInput.addEventListener('change', syncDiskEncryptionFields);
      traefikModeInput.addEventListener('change', syncApplicationFields);
      dockerhubModeInput.addEventListener('change', syncApplicationFields);
      syncDiskEncryptionFields();
      syncApplicationFields();
      renderUsers();

      loadDefaults().catch(() => {
        showStatus('error', 'Could not load repository defaults.');
      });
    </script>
  </body>
</html>`
}

export function startEnvironmentInitUi() {
  const server = http.createServer(handleRequest)

  server.listen(DEFAULT_PORT, HOST, () => {
    const address = server.address() as AddressInfo
    const url = `http://${HOST}:${address.port}`

    console.log(`OpenCRVS environment setup is running at ${url}`)
    openBrowser(url)
  })
}

if (require.main === module) {
  startEnvironmentInitUi()
}
