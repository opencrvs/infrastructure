import fs from 'fs'
import path from 'path'

export type NextStepsInput = {
  ansibleEnabled: boolean
  environmentName: string
  organisation?: string
  repository?: string
  token?: string
  kubeAPIHost?: string
  kubeWorkerNodes?: string
  backupEnabled: boolean
  backupHost?: string
  inventoryAlreadyExists?: boolean
}

export type NextSteps = {
  primaryHost: string
  primaryCommand: string
  workerNodes: string[]
  backupHost: string
  additionalHosts: string[]
  additionalCommand: string
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

export function getInventoryPath(environmentName: string) {
  return path.join(
    process.cwd(),
    'infrastructure',
    'server-setup',
    'inventory',
    `${environmentName}.yml`
  )
}

export function inventoryExists(environmentName: string) {
  return fs.existsSync(getInventoryPath(environmentName))
}

export function buildNextSteps(input: NextStepsInput): NextSteps | null {
  const inventoryAlreadyExists =
    input.inventoryAlreadyExists ?? inventoryExists(input.environmentName)

  if (!input.ansibleEnabled || inventoryAlreadyExists) {
    return null
  }

  const organisation = input.organisation || '<org name>'
  const repository = input.repository || '<repo name>'
  const token = input.token || '<github token>'
  const primaryHost = input.kubeAPIHost || 'KUBE_API_HOST'
  const workerNodes = (input.kubeWorkerNodes || '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean)
  const backupHost = input.backupEnabled ? input.backupHost || '' : ''

  return {
    primaryHost,
    primaryCommand: [
      'curl -sfL https://raw.githubusercontent.com/opencrvs/infrastructure/refs/heads/develop/scripts/bootstrap/opencrvs-bootstrap.sh \\',
      '     -o opencrvs-bootstrap.sh && \\',
      `bash opencrvs-bootstrap.sh --owner ${shellQuote(organisation)} \\`,
      `            --repo ${shellQuote(repository)} \\`,
      `            --env ${shellQuote(input.environmentName)} \\`,
      `            --token ${shellQuote(token)} \\`,
      '            --enable-runner'
    ].join('\n'),
    workerNodes,
    backupHost,
    additionalHosts: [...new Set([...workerNodes, backupHost].filter(Boolean))],
    additionalCommand: [
      'curl -sfL https://raw.githubusercontent.com/opencrvs/infrastructure/refs/heads/develop/scripts/bootstrap/opencrvs-bootstrap.sh -o opencrvs-bootstrap.sh && \\',
      '    bash opencrvs-bootstrap.sh --ssh-public-key "<public key from master node>"'
    ].join('\n')
  }
}
