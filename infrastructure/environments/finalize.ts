import fs from 'fs'
import path from 'path'
import { dump as dumpYaml } from 'js-yaml'

import type { GithubUpdate } from './github-plan'
import type { HelmUpdate } from './helm-plan'

export type FinalizeInput = {
  environmentName: string
  githubEnabled: boolean
  ansibleEnabled: boolean
  helmEnabled: boolean
  inventoryValues: unknown
  chartValues: unknown
  githubUpdates: {
    variables: GithubUpdate[]
    secrets: GithubUpdate[]
  }
  helmUpdates: HelmUpdate[]
  applyInventory: (environmentName: string, values: unknown) => void
  applyChartValues: (environmentName: string, values: unknown) => void
  applyHelmUpdates: (updates: HelmUpdate[]) => void
  applyGithub: (updates: GithubUpdate[]) => Promise<string[]>
}

export type ValuesSecretsFile = {
  path: string
  downloadUrl: string
}

export type FinalizeResult = {
  performedActions: string[]
  valuesSecretsFile: ValuesSecretsFile | null
}

function getValuesSecretsPath(environmentName: string) {
  return path.join(
    process.cwd(),
    'environments',
    environmentName,
    'values.secrets.yaml'
  )
}

function getSecretPath(update: GithubUpdate) {
  return update.scope === 'REPOSITORY'
    ? ['repository', update.name]
    : ['environment', update.name]
}

function setSecretValue(
  target: Record<string, unknown>,
  segments: string[],
  value: string
) {
  const finalSegment = segments[segments.length - 1]
  let current = target

  for (const segment of segments.slice(0, -1)) {
    if (
      !current[segment] ||
      typeof current[segment] !== 'object' ||
      Array.isArray(current[segment])
    ) {
      current[segment] = {}
    }
    current = current[segment] as Record<string, unknown>
  }

  current[finalSegment] = value
}

export function writeValuesSecretsFile(
  environmentName: string,
  secrets: GithubUpdate[]
): ValuesSecretsFile | null {
  const values = secrets.filter((secret) =>
    secret.type === 'SECRET' &&
    Boolean(secret.value) &&
    !secret.value.startsWith('[')
  )

  if (!values.length) {
    return null
  }

  const output: Record<string, unknown> = {}
  for (const secret of values) {
    setSecretValue(output, getSecretPath(secret), secret.value)
  }

  const outputPath = getValuesSecretsPath(environmentName)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, dumpYaml(output, { noRefs: true, lineWidth: 100 }), 'utf8')

  return {
    path: path.relative(process.cwd(), outputPath),
    downloadUrl: '/api/finalize/values-secrets'
  }
}

export async function finalizeConfiguration(
  input: FinalizeInput
): Promise<FinalizeResult> {
  const performedActions: string[] = []
  let valuesSecretsFile: ValuesSecretsFile | null = null

  if (input.ansibleEnabled && input.inventoryValues) {
    input.applyInventory(input.environmentName, input.inventoryValues)
    performedActions.push(
      `Generated inventory file infrastructure/server-setup/inventory/${input.environmentName}.yml`
    )
  }

  if (input.helmEnabled && input.chartValues) {
    input.applyChartValues(input.environmentName, input.chartValues)
    performedActions.push(`Generated Helm chart values under environments/${input.environmentName}`)
    input.applyHelmUpdates(input.helmUpdates)
    performedActions.push('Applied managed Helm chart overrides')
  }

  if (input.githubEnabled) {
    performedActions.push(
      ...(await input.applyGithub([
        ...input.githubUpdates.variables,
        ...input.githubUpdates.secrets
      ]))
    )
  } else if (input.helmEnabled) {
    valuesSecretsFile = writeValuesSecretsFile(
      input.environmentName,
      input.githubUpdates.secrets
    )
    if (valuesSecretsFile) {
      performedActions.push(`Generated external Helm secrets file ${valuesSecretsFile.path}`)
    }
  }

  return {
    performedActions,
    valuesSecretsFile
  }
}
