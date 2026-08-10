import type { HelmUpdate } from './helm-plan'
import type { GithubUpdate } from './github-plan'

export type ReviewPlanInput = {
  environmentName: string
  deploymentFeatures: string[]
  /**
   * @deprecated Review plans never expose secret values. This property remains
   * temporarily for compatibility with callers that still provide it.
   */
  includeSecretValues: boolean
  githubUpdates: {
    variables: GithubUpdate[]
    secrets: GithubUpdate[]
  }
  inventoryValues: unknown
  chartValues: unknown
  helmUpdates: HelmUpdate[]
}

export function buildFilesToUpdate(input: {
  environmentName: string
  hasAnsible: boolean
  hasHelm: boolean
  hasGithub: boolean
}) {
  const chartFiles = [
    'dependencies/values.yaml',
    'opencrvs-services/values.yaml',
    'traefik/values.yaml'
  ].map((file) => `environments/${input.environmentName}/${file}`)
  const inventoryFiles = input.hasAnsible
    ? [`infrastructure/server-setup/inventory/${input.environmentName}.yml`]
    : []
  const workflowFiles = input.hasGithub
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
    ...(input.hasHelm ? chartFiles : []),
    ...workflowFiles
  ]
}

export function buildReviewPlan(input: ReviewPlanInput) {
  const visibleSecrets = input.githubUpdates.secrets.filter(
    (secret) => !secret.hidden
  )

  return {
    files: buildFilesToUpdate({
      environmentName: input.environmentName,
      hasAnsible: input.deploymentFeatures.includes('ansible'),
      hasHelm: input.deploymentFeatures.includes('helm'),
      hasGithub: input.deploymentFeatures.includes('github')
    }),
    variables: input.githubUpdates.variables,
    secrets: visibleSecrets.map(({ value, ...secret }) => secret),
    deploymentFeatures: input.deploymentFeatures,
    inventoryValues: input.inventoryValues,
    chartValues: input.chartValues,
    helmUpdates: input.helmUpdates
  }
}
