import {
  CONFIGURATION_FIELDS,
  CONFIGURATION_SCREENS,
  getConfigurationFields
} from './configuration-fields'
import type {
  ConfigurationField,
  FieldBinding,
  GithubBinding,
} from './configuration-fields'
import type { ConfigurationValue } from './configuration-state'

export type GithubUpdate = {
  scope: 'ENVIRONMENT' | 'REPOSITORY'
  type: 'VARIABLE' | 'SECRET'
  name: string
  value: string
  exists: boolean
  action: 'create' | 'update' | 'unchanged'
}

export type GithubSecretPlanItem = {
  scope: 'ENVIRONMENT' | 'REPOSITORY'
  type: 'SECRET'
  name: string
  value: string
}

export type GithubPlanInput = {
  enabled: boolean
  includeSecretValues: boolean
  approvalRequired: boolean
  githubApprovers: string
  applicationDomain: string
  githubToken: string
  applicationSecrets: GithubSecretPlanItem[]
  dependencyFields: ConfigurationField[]
  advancedFields: ConfigurationField[]
  dependenciesConfig: Record<string, ConfigurationValue>
  advancedConfig: Record<string, ConfigurationValue>
  genericScreenConfigs: Record<string, Record<string, ConfigurationValue>>
  backupEnabled: boolean
  diskEncryptionEnabled: boolean
  isFieldEnabled: (field: ConfigurationField) => boolean
  isFieldActive: (field: ConfigurationField) => boolean
  getFieldValue: (field: ConfigurationField) => ConfigurationValue
  getActiveBindings: (field: ConfigurationField) => FieldBinding[]
  getVariableValue: (scope: 'ENVIRONMENT' | 'REPOSITORY', name: string) => string
  variableExists: (scope: 'ENVIRONMENT' | 'REPOSITORY', name: string) => boolean
  secretExists: (scope: 'ENVIRONMENT' | 'REPOSITORY', name: string) => boolean
  hasEnvironmentSecret: (name: string) => boolean
  getEncryptionKey: () => string
  getBackupEncryptionPassphrase: () => string
  getBackupHostKeyPair: () => {
    privateKey: string
    publicKey: string
  }
}

export function planVariable(
  scope: 'ENVIRONMENT' | 'REPOSITORY',
  name: string,
  value: string,
  exists: boolean,
  currentValue = ''
): GithubUpdate {
  return {
    scope,
    type: 'VARIABLE',
    name,
    value,
    exists,
    action: exists ? currentValue === value ? 'unchanged' : 'update' : 'create'
  }
}

export function planSecret(
  scope: 'ENVIRONMENT' | 'REPOSITORY',
  name: string,
  value: string,
  exists: boolean
): GithubUpdate {
  return {
    scope,
    type: 'SECRET',
    name,
    value,
    exists,
    action: value ? (exists ? 'update' : 'create') : exists ? 'unchanged' : 'create'
  }
}

export function buildApplicationSecretItems(
  config: {
    dockerhubMode?: 'opencrvs' | 'custom'
    dockerhubOrganisation?: string
    dockerhubRepository?: string
    dockerhubUsername?: string
    dockerhubToken?: string
    traefikMode?: 'lets_encrypt' | 'static_ssl' | 'custom'
    sslCrt?: string
    sslKey?: string
    smtpEnabled?: boolean
    smtpHost?: string
    smtpUsername?: string
    smtpPassword?: string
    smtpPort?: string
    smtpSecure?: string | boolean
    senderEmailAddress?: string
    alertEmail?: string
  },
  hasEnvironmentSecret: (name: string) => boolean
) {
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

  return [
    ...dockerhubSecrets,
    ...sslSecrets,
    ...smtpSecrets
  ] as GithubSecretPlanItem[]
}

function buildFieldSecrets(
  fields: ConfigurationField[],
  config: Record<string, ConfigurationValue>,
  input: GithubPlanInput
) {
  const secrets: GithubUpdate[] = []

  for (const field of fields) {
    if (!input.isFieldEnabled(field) || !input.isFieldActive(field)) {
      continue
    }

    for (const binding of input.getActiveBindings(field)) {
      if (binding.target !== 'github' || binding.type !== 'SECRET') {
        continue
      }

      const value = String(config[field.id] ?? '')
      secrets.push(
        planSecret(
          binding.scope,
          binding.name,
          input.includeSecretValues ? value : value ? '[provided on submit]' : '',
          input.secretExists(binding.scope, binding.name)
        )
      )
    }
  }

  return secrets
}

export function buildGithubUpdates(input: GithubPlanInput) {
  if (!input.enabled) {
    return {
      variables: [] as GithubUpdate[],
      secrets: [] as GithubUpdate[]
    }
  }

  const variables = [
    planVariable(
      'ENVIRONMENT',
      'APPROVAL_REQUIRED',
      input.approvalRequired ? 'true' : 'false',
      input.variableExists('ENVIRONMENT', 'APPROVAL_REQUIRED'),
      input.getVariableValue('ENVIRONMENT', 'APPROVAL_REQUIRED')
    )
  ]

  if (input.applicationDomain) {
    variables.push(planVariable(
      'ENVIRONMENT',
      'CONTENT_SECURITY_POLICY_WILDCARD',
      `*.${input.applicationDomain}`,
      input.variableExists('ENVIRONMENT', 'CONTENT_SECURITY_POLICY_WILDCARD'),
      input.getVariableValue('ENVIRONMENT', 'CONTENT_SECURITY_POLICY_WILDCARD')
    ))
  }

  if (input.githubApprovers.trim()) {
    variables.unshift(
      planVariable(
        'REPOSITORY',
        'GH_APPROVERS',
        input.githubApprovers,
        input.variableExists('REPOSITORY', 'GH_APPROVERS'),
        input.getVariableValue('REPOSITORY', 'GH_APPROVERS')
      )
    )
  }

  const configuredVariables = CONFIGURATION_FIELDS.flatMap((field) => {
    if (!input.isFieldEnabled(field) || !input.isFieldActive(field)) {
      return []
    }

    const value = String(input.getFieldValue(field)).trim()

    return input.getActiveBindings(field)
      .filter((binding): binding is GithubBinding =>
        binding.target === 'github' && binding.type === 'VARIABLE'
      )
      .flatMap((binding) => {
        if (binding.omitWhenEmpty && !value) {
          return []
        }

        return [
          planVariable(
            binding.scope,
            binding.name,
            value,
            input.variableExists(binding.scope, binding.name),
            input.getVariableValue(binding.scope, binding.name)
          )
        ]
      })
  })

  variables.push(...configuredVariables)

  const secrets = input.applicationSecrets.map((secret) =>
    planSecret(
      secret.scope,
      secret.name,
      input.includeSecretValues
        ? secret.value
        : secret.value
          ? '[provided on submit]'
          : '',
      input.secretExists(secret.scope, secret.name)
    )
  )

  secrets.push(
    planSecret(
      'REPOSITORY',
      'GH_TOKEN',
      input.includeSecretValues
        ? input.githubToken
        : input.githubToken
          ? '[provided at login]'
          : '',
      input.secretExists('REPOSITORY', 'GH_TOKEN')
    )
  )

  secrets.push(
    ...buildFieldSecrets(
      input.dependencyFields,
      input.dependenciesConfig,
      input
    ),
    ...buildFieldSecrets(
      input.advancedFields,
      input.advancedConfig,
      input
    )
  )

  for (const definition of CONFIGURATION_SCREENS) {
    if ([
      'infrastructure',
      'application',
      'containerRegistry',
      'dependencies'
    ].includes(definition.id)) {
      continue
    }
    for (const field of getConfigurationFields(definition.id)) {
      secrets.push(
        ...buildFieldSecrets(
          [field],
          input.genericScreenConfigs[definition.id] || {},
          input
        )
      )
    }
  }

  if (input.backupEnabled) {
    const passphraseExists = input.secretExists(
      'ENVIRONMENT',
      'BACKUP_ENCRYPTION_PASSPHRASE'
    )
    const privateKeyExists = input.secretExists('ENVIRONMENT', 'BACKUP_HOST_PRIVATE_KEY')
    const publicKeyExists = input.secretExists('ENVIRONMENT', 'BACKUP_HOST_PUBLIC_KEY')
    const needsBackupKeyPair = !privateKeyExists || !publicKeyExists
    const keyPair =
      input.includeSecretValues && needsBackupKeyPair
        ? input.getBackupHostKeyPair()
        : { privateKey: '', publicKey: '' }

    secrets.push(
      planSecret(
        'ENVIRONMENT',
        'BACKUP_ENCRYPTION_PASSPHRASE',
        passphraseExists
          ? ''
          : input.includeSecretValues
            ? input.getBackupEncryptionPassphrase()
            : '[generated on finalize]',
        passphraseExists
      ),
      planSecret(
        'ENVIRONMENT',
        'BACKUP_HOST_PRIVATE_KEY',
        !needsBackupKeyPair
          ? ''
          : input.includeSecretValues
            ? keyPair.privateKey
            : '[generated on finalize]',
        privateKeyExists
      ),
      planSecret(
        'ENVIRONMENT',
        'BACKUP_HOST_PUBLIC_KEY',
        !needsBackupKeyPair
          ? ''
          : input.includeSecretValues
            ? keyPair.publicKey
            : '[generated on finalize]',
        publicKeyExists
      )
    )
  }

  if (input.diskEncryptionEnabled) {
    const exists = input.secretExists('ENVIRONMENT', 'ENCRYPTION_KEY')

    secrets.push(
      planSecret(
        'ENVIRONMENT',
        'ENCRYPTION_KEY',
        exists
          ? ''
          : input.includeSecretValues
            ? input.getEncryptionKey()
            : '[generated on finalize]',
        exists
      )
    )
  }

  return {
    variables,
    secrets
  }
}
