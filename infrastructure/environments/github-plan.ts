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
  hidden?: boolean
}

export type GithubPlanInput = {
  enabled: boolean
  environmentExists: boolean
  includeSecretValues: boolean
  approvalRequired: boolean
  githubApprovers: string
  applicationDomain: string
  githubToken: string
  fields: ConfigurationField[]
  backupEnabled: boolean
  diskEncryptionEnabled: boolean
  isFieldEnabled: (field: ConfigurationField) => boolean
  isFieldActive: (field: ConfigurationField) => boolean
  getFieldValue: (field: ConfigurationField) => ConfigurationValue
  getActiveBindings: (field: ConfigurationField) => FieldBinding[]
  getVariableValue: (scope: 'ENVIRONMENT' | 'REPOSITORY', name: string) => string
  variableExists: (scope: 'ENVIRONMENT' | 'REPOSITORY', name: string) => boolean
  secretExists: (scope: 'ENVIRONMENT' | 'REPOSITORY', name: string) => boolean
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
  exists: boolean,
  hidden = false
): GithubUpdate {
  return {
    scope,
    type: 'SECRET',
    name,
    value,
    exists,
    action: value ? (exists ? 'update' : 'create') : exists ? 'unchanged' : 'create',
    hidden
  }
}

function buildFieldSecrets(
  fields: ConfigurationField[],
  input: GithubPlanInput
) {
  const secrets: GithubUpdate[] = []

  for (const field of fields) {
    if (!input.isFieldEnabled(field) || !input.isFieldActive(field)) {
      continue
    }

    if (field.createOnlyForNewEnvironment && input.environmentExists) {
      continue
    }

    for (const binding of input.getActiveBindings(field)) {
      if (binding.target !== 'github' || binding.type !== 'SECRET') {
        continue
      }

      const exists = input.secretExists(binding.scope, binding.name)
      const value = String(input.getFieldValue(field) ?? '')
      if (binding.omitWhenEmpty && !value) {
        continue
      }

      secrets.push(
        planSecret(
          binding.scope,
          binding.name,
          input.includeSecretValues ? value : value ? '[provided on submit]' : '',
          exists,
          Boolean(field.hidden)
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

  const configuredVariables = input.fields.flatMap((field) => {
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

  const secrets = buildFieldSecrets(input.fields, input)

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
