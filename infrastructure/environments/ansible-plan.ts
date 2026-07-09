export type InventoryUser = {
  name: string
  ssh_keys: string[]
  state: 'present' | 'absent'
  role: 'admin' | 'operator'
}

export type InventoryConfig = {
  kubeAPIHost?: string
  kubeWorkerNodes?: string
  users?: InventoryUser[]
}

export type InventoryApplicationConfig = {
  backupRestoreMode?: string
  backupHost?: string
}

export function buildInventoryValues(
  config: InventoryConfig,
  applicationConfig?: InventoryApplicationConfig | null
) {
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
