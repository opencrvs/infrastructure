export type ConfigurationScreen = string
export type DeploymentFeature = 'github' | 'ansible' | 'helm'

export type ConfigurationSubScreen = {
  id: string
  label: string
  order: number
}

export type ConfigurationScreenDefinition = {
  id: ConfigurationScreen
  label: string
  description: string
  order: number
  submitLabel: string
  savedMessage: string
  nextScreen?: string
  requires?: DeploymentFeature[]
  customComponents?: Array<'users'>
  subScreens?: ConfigurationSubScreen[]
}

export type GithubBinding = {
  target: 'github'
  type: 'VARIABLE' | 'SECRET'
  scope: 'REPOSITORY' | 'ENVIRONMENT'
  name: string
  omitWhenEmpty?: boolean
}

export type HelmChart = 'dependencies' | 'opencrvs-services' | 'traefik'

export type HelmBinding = {
  target: 'helm'
  chart: HelmChart
  path: string
  omitWhenDefault?: boolean
  skipPathValidation?: boolean
}

export type AnsibleBinding = {
  target: 'ansible'
  name: string
}

export type FieldBinding = AnsibleBinding | GithubBinding | HelmBinding

export type FieldSource =
  | {
      target: 'github'
      scope: 'REPOSITORY' | 'ENVIRONMENT'
      name: string
    }
  | {
      target: 'helm'
      chart: HelmChart
      path: string
    }
  | {
      target: 'state'
      name: string
    }

export type ConfigurationField = {
  id: string
  screen: ConfigurationScreen
  subScreen?: string
  section: string
  label: string
  description: string
  control: 'checkbox' | 'number' | 'password' | 'select' | 'text' | 'textarea'
  requires?: DeploymentFeature[]
  source: FieldSource
  bindings: FieldBinding[]
  defaultValue?: string | number | boolean
  options?: Array<{
    label: string
    value: string
  }>
  required?: boolean
  validator?: 'kubernetes-memory' | 'positive-integer'
  generatedDefault?: 'username' | 'password'
  readonly?: boolean
  visibleWhen?: {
    fieldId: string
    equals: string | number | boolean
  }
  requiredWhen?: {
    context: string
    equals: string | number | boolean
  }
  disabled?: boolean
  suggestions?: string[]
  existingSecretBehavior?: 'replace'
}

export const CONFIGURATION_SCREENS: ConfigurationScreenDefinition[] = [
  {
    id: 'infrastructure',
    label: 'Infrastructure',
    description: 'Configure the Kubernetes endpoint, worker nodes, API access ranges, and disk encryption settings for this environment.',
    order: 10,
    submitLabel: 'Save infrastructure',
    savedMessage: 'Infrastructure configuration saved.',
    nextScreen: 'application',
    requires: ['ansible'],
    customComponents: ['users']
  },
  {
    id: 'application',
    label: 'Application',
    description: 'Configure OpenCRVS domain, Traefik TLS mode, and the country configuration Docker image source.',
    order: 20,
    submitLabel: 'Save application',
    savedMessage: 'Application configuration saved.',
    nextScreen: 'review'
  },
  {
    id: 'dependencies',
    label: 'Dependencies',
    description: 'Choose which supporting services are deployed with OpenCRVS and configure connections to external services.',
    order: 30,
    submitLabel: 'Save dependencies',
    savedMessage: 'Dependency configuration saved.',
    nextScreen: 'review'
  },
  {
    id: 'advanced',
    label: 'Advanced',
    description: 'Configure additional settings by OpenCRVS domain.',
    order: 40,
    submitLabel: 'Save advanced settings',
    savedMessage: 'Advanced configuration saved.',
    nextScreen: 'review',
    subScreens: [
      { id: 'application', label: 'Application', order: 10 },
      { id: 'dependencies', label: 'Dependencies', order: 20 },
      { id: 'infrastructure', label: 'Infrastructure', order: 30 }
    ]
  }
]

export const CONFIGURATION_FIELDS: ConfigurationField[] = [
  {
    id: 'kubeAPIHost',
    screen: 'infrastructure',
    section: 'Kubernetes',
    label: 'KUBE_API_HOST',
    description: 'Kubernetes API endpoint. Empty values use auto-detection.',
    control: 'text',
    source: {
      target: 'github',
      scope: 'ENVIRONMENT',
      name: 'KUBE_API_HOST'
    },
    bindings: [
      {
        target: 'github',
        type: 'VARIABLE',
        scope: 'ENVIRONMENT',
        name: 'KUBE_API_HOST',
        omitWhenEmpty: true
      },
      {
        target: 'ansible',
        name: 'kube_api_host'
      }
    ]
  },
  {
    id: 'kubeWorkerNodes',
    screen: 'infrastructure',
    section: 'Kubernetes',
    label: 'KUBE_WORKER_NODES',
    description: 'Comma-separated Kubernetes worker node hostnames or IP addresses.',
    control: 'text',
    source: {
      target: 'github',
      scope: 'ENVIRONMENT',
      name: 'KUBE_WORKER_NODES'
    },
    bindings: [
      {
        target: 'github',
        type: 'VARIABLE',
        scope: 'ENVIRONMENT',
        name: 'KUBE_WORKER_NODES',
        omitWhenEmpty: true
      },
      {
        target: 'ansible',
        name: 'kube_worker_nodes'
      }
    ]
  },
  {
    id: 'kubeApiAllowedCidrs',
    screen: 'infrastructure',
    section: 'Kubernetes',
    label: 'KUBE_API_ALLOWED_CIDRS',
    description: 'Comma-separated CIDR ranges allowed to access the Kubernetes API.',
    control: 'text',
    source: {
      target: 'github',
      scope: 'ENVIRONMENT',
      name: 'KUBE_API_ALLOWED_CIDRS'
    },
    bindings: [
      {
        target: 'github',
        type: 'VARIABLE',
        scope: 'ENVIRONMENT',
        name: 'KUBE_API_ALLOWED_CIDRS',
        omitWhenEmpty: true
      },
      {
        target: 'ansible',
        name: 'kube_api_allowed_cidrs'
      }
    ]
  },
  {
    id: 'enableDiskEncryption',
    screen: 'infrastructure',
    section: 'Disk Encryption',
    label: 'Enable disk encryption',
    description: 'Create and store the environment encryption key in GitHub.',
    control: 'checkbox',
    requires: ['github'],
    defaultValue: false,
    source: { target: 'state', name: 'enableDiskEncryption' },
    bindings: []
  },
  {
    id: 'diskSpace',
    screen: 'infrastructure',
    section: 'Disk Encryption',
    label: 'DISK_SPACE',
    description: 'Amount of disk space to dedicate to encrypted OpenCRVS data.',
    control: 'text',
    required: true,
    defaultValue: '200g',
    visibleWhen: { fieldId: 'enableDiskEncryption', equals: true },
    source: { target: 'github', scope: 'ENVIRONMENT', name: 'DISK_SPACE' },
    bindings: [
      {
        target: 'github',
        type: 'VARIABLE',
        scope: 'ENVIRONMENT',
        name: 'DISK_SPACE',
        omitWhenEmpty: true
      }
    ]
  },
  {
    id: 'domain',
    screen: 'application',
    section: 'OpenCRVS',
    label: 'Domain',
    description: 'Base domain used after OpenCRVS subdomains.',
    control: 'text',
    required: true,
    source: {
      target: 'github',
      scope: 'ENVIRONMENT',
      name: 'DOMAIN'
    },
    bindings: [
      {
        target: 'github',
        type: 'VARIABLE',
        scope: 'ENVIRONMENT',
        name: 'DOMAIN'
      },
      {
        target: 'helm',
        chart: 'opencrvs-services',
        path: 'hostname'
      },
      {
        target: 'helm',
        chart: 'dependencies',
        path: 'hostname'
      }
    ]
  },
  {
    id: 'traefikMode',
    screen: 'application',
    section: 'Traefik SSL Certificate',
    label: 'Certificate mode',
    description: 'Choose how Traefik obtains and serves the environment certificate.',
    control: 'select',
    requires: ['helm'],
    required: true,
    defaultValue: 'lets_encrypt',
    options: [
      { label: "Let's Encrypt certificate", value: 'lets_encrypt' },
      { label: 'Static SSL certificate', value: 'static_ssl' },
      { label: 'Custom configuration', value: 'custom' }
    ],
    source: { target: 'state', name: 'traefikMode' },
    bindings: []
  },
  {
    id: 'sslCrt',
    screen: 'application',
    section: 'Traefik SSL Certificate',
    label: 'SSL_CRT',
    description: 'PEM-encoded SSL certificate or certificate chain.',
    control: 'textarea',
    required: true,
    visibleWhen: { fieldId: 'traefikMode', equals: 'static_ssl' },
    existingSecretBehavior: 'replace',
    source: {
      target: 'github',
      scope: 'ENVIRONMENT',
      name: 'SSL_CRT'
    },
    bindings: [
      {
        target: 'github',
        type: 'SECRET',
        scope: 'ENVIRONMENT',
        name: 'SSL_CRT'
      }
    ]
  },
  {
    id: 'sslKey',
    screen: 'application',
    section: 'Traefik SSL Certificate',
    label: 'SSL_KEY',
    description: 'PEM-encoded private key for the SSL certificate.',
    control: 'textarea',
    required: true,
    visibleWhen: { fieldId: 'traefikMode', equals: 'static_ssl' },
    existingSecretBehavior: 'replace',
    source: {
      target: 'github',
      scope: 'ENVIRONMENT',
      name: 'SSL_KEY'
    },
    bindings: [
      {
        target: 'github',
        type: 'SECRET',
        scope: 'ENVIRONMENT',
        name: 'SSL_KEY'
      }
    ]
  },
  {
    id: 'dockerhubMode',
    screen: 'application',
    section: 'Docker Hub',
    label: 'Country configuration image source',
    description: 'Use the OpenCRVS Farajaland image or provide another Docker Hub repository.',
    control: 'select',
    requires: ['github'],
    defaultValue: 'opencrvs',
    options: [
      {
        label: 'Use Farajaland repository provided by OpenCRVS',
        value: 'opencrvs'
      },
      { label: 'Provide own repository', value: 'custom' }
    ],
    source: { target: 'state', name: 'dockerhubMode' },
    bindings: []
  },
  {
    id: 'dockerhubOrganisation',
    screen: 'application',
    section: 'Docker Hub',
    label: 'DOCKERHUB_ACCOUNT',
    description: 'Docker Hub account or organisation containing the country configuration image.',
    control: 'password',
    required: true,
    visibleWhen: { fieldId: 'dockerhubMode', equals: 'custom' },
    source: { target: 'github', scope: 'REPOSITORY', name: 'DOCKERHUB_ACCOUNT' },
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'REPOSITORY', name: 'DOCKERHUB_ACCOUNT' }
    ]
  },
  {
    id: 'dockerhubRepository',
    screen: 'application',
    section: 'Docker Hub',
    label: 'DOCKERHUB_REPO',
    description: 'Docker Hub repository containing the country configuration image.',
    control: 'password',
    required: true,
    visibleWhen: { fieldId: 'dockerhubMode', equals: 'custom' },
    source: { target: 'github', scope: 'REPOSITORY', name: 'DOCKERHUB_REPO' },
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'REPOSITORY', name: 'DOCKERHUB_REPO' }
    ]
  },
  {
    id: 'dockerhubUsername',
    screen: 'application',
    section: 'Docker Hub',
    label: 'DOCKER_USERNAME',
    description: 'Username used to authenticate with Docker Hub.',
    control: 'password',
    required: true,
    visibleWhen: { fieldId: 'dockerhubMode', equals: 'custom' },
    source: { target: 'github', scope: 'REPOSITORY', name: 'DOCKER_USERNAME' },
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'REPOSITORY', name: 'DOCKER_USERNAME' }
    ]
  },
  {
    id: 'dockerhubToken',
    screen: 'application',
    section: 'Docker Hub',
    label: 'DOCKER_TOKEN',
    description: 'Access token used to authenticate with Docker Hub.',
    control: 'password',
    required: true,
    visibleWhen: { fieldId: 'dockerhubMode', equals: 'custom' },
    source: { target: 'github', scope: 'REPOSITORY', name: 'DOCKER_TOKEN' },
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'REPOSITORY', name: 'DOCKER_TOKEN' }
    ]
  },
  {
    id: 'kibanaUsername',
    screen: 'advanced',
    subScreen: 'dependencies',
    section: 'Monitoring',
    label: 'KIBANA_USERNAME',
    description: 'Username used to log in to Kibana.',
    control: 'password',
    required: true,
    defaultValue: 'opencrvs-admin',
    source: { target: 'github', scope: 'ENVIRONMENT', name: 'KIBANA_USERNAME' },
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'ENVIRONMENT', name: 'KIBANA_USERNAME' },
    ]
  },
  {
    id: 'kibanaPassword',
    screen: 'advanced',
    subScreen: 'dependencies',
    section: 'Monitoring',
    label: 'KIBANA_PASSWORD',
    description: 'Password used to log in to Kibana.',
    control: 'password',
    required: true,
    generatedDefault: 'password',
    source: { target: 'github', scope: 'ENVIRONMENT', name: 'KIBANA_PASSWORD' },
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'ENVIRONMENT', name: 'KIBANA_PASSWORD' }
    ]
  },
  {
    id: 'sentryDsn',
    screen: 'advanced',
    subScreen: 'dependencies',
    section: 'Monitoring',
    label: 'SENTRY_DSN',
    description: 'Sentry DSN used for application error reporting.',
    control: 'password',
    source: { target: 'github', scope: 'ENVIRONMENT', name: 'SENTRY_DSN' },
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'ENVIRONMENT', name: 'SENTRY_DSN' }
    ]
  },
  {
    id: 'backupRestoreMode',
    screen: 'application',
    section: 'Backup and Restore',
    label: 'Configuration',
    description: 'Backup and restore are mutually exclusive. Either option can be selected until one is configured.',
    control: 'select',
    requires: ['github'],
    defaultValue: 'none',
    options: [
      { label: 'No backup or restore', value: 'none' },
      { label: 'Configure backup', value: 'backup' },
      { label: 'Restore from another environment', value: 'restore' }
    ],
    source: { target: 'state', name: 'backupRestoreMode' },
    bindings: []
  },
  {
    id: 'backupHost',
    screen: 'application',
    section: 'Backup and Restore',
    label: 'BACKUP_HOST',
    description: 'Backup server hostname or IP address.',
    control: 'text',
    required: true,
    visibleWhen: { fieldId: 'backupRestoreMode', equals: 'backup' },
    source: { target: 'github', scope: 'ENVIRONMENT', name: 'BACKUP_HOST' },
    bindings: [
      {
        target: 'github',
        type: 'VARIABLE',
        scope: 'ENVIRONMENT',
        name: 'BACKUP_HOST',
        omitWhenEmpty: true
      }
    ]
  },
  {
    id: 'backupUser',
    screen: 'application',
    section: 'Backup and Restore',
    label: 'BACKUP_SERVER_USER',
    description: 'Username used to connect to the backup server.',
    control: 'password',
    defaultValue: 'backup',
    required: true,
    visibleWhen: { fieldId: 'backupRestoreMode', equals: 'backup' },
    source: { target: 'github', scope: 'ENVIRONMENT', name: 'BACKUP_SERVER_USER' },
    bindings: [
      {
        target: 'github',
        type: 'SECRET',
        scope: 'ENVIRONMENT',
        name: 'BACKUP_SERVER_USER'
      }
    ]
  },
  {
    id: 'backupType',
    screen: 'application',
    section: 'Backup and Restore',
    label: 'BACKUP_ENVIRONMENT_MODE',
    description: 'Backup schedule and strategy for this environment.',
    control: 'select',
    defaultValue: 'dump',
    required: true,
    visibleWhen: { fieldId: 'backupRestoreMode', equals: 'backup' },
    options: [
      { label: 'Full dump (daily full database backup)', value: 'dump' },
      { label: 'Differential (weekly full, daily differential backup)', value: 'differential' }
    ],
    source: { target: 'github', scope: 'ENVIRONMENT', name: 'BACKUP_ENVIRONMENT_MODE' },
    bindings: [
      {
        target: 'github',
        type: 'VARIABLE',
        scope: 'ENVIRONMENT',
        name: 'BACKUP_ENVIRONMENT_MODE',
        omitWhenEmpty: true
      }
    ]
  },
  {
    id: 'restoreEnvironmentName',
    screen: 'application',
    section: 'Backup and Restore',
    label: 'RESTORE_ENVIRONMENT_NAME',
    description: 'Environment whose backup should be restored.',
    control: 'text',
    required: true,
    visibleWhen: { fieldId: 'backupRestoreMode', equals: 'restore' },
    source: { target: 'github', scope: 'ENVIRONMENT', name: 'RESTORE_ENVIRONMENT_NAME' },
    bindings: [
      {
        target: 'github',
        type: 'VARIABLE',
        scope: 'ENVIRONMENT',
        name: 'RESTORE_ENVIRONMENT_NAME',
        omitWhenEmpty: true
      }
    ]
  },
  {
    id: 'restoreType',
    screen: 'application',
    section: 'Backup and Restore',
    label: 'RESTORE_ENVIRONMENT_MODE',
    description: 'Backup format to restore from the source environment.',
    control: 'select',
    defaultValue: 'dump',
    required: true,
    visibleWhen: { fieldId: 'backupRestoreMode', equals: 'restore' },
    options: [
      { label: 'Full dump (daily full database backup)', value: 'dump' },
      { label: 'Differential (weekly full, daily differential backup)', value: 'differential' }
    ],
    source: { target: 'github', scope: 'ENVIRONMENT', name: 'RESTORE_ENVIRONMENT_MODE' },
    bindings: [
      {
        target: 'github',
        type: 'VARIABLE',
        scope: 'ENVIRONMENT',
        name: 'RESTORE_ENVIRONMENT_MODE',
        omitWhenEmpty: true
      }
    ]
  },
  {
    id: 'metabaseAdminEmail',
    screen: 'advanced',
    subScreen: 'application',
    section: 'Metabase Administration',
    label: 'OPENCRVS_METABASE_ADMIN_EMAIL',
    description: 'Email used as the Metabase super administrator username.',
    control: 'password',
    required: true,
    defaultValue: 'user@opencrvs.org',
    source: {
      target: 'github',
      scope: 'ENVIRONMENT',
      name: 'OPENCRVS_METABASE_ADMIN_EMAIL'
    },
    bindings: [
      {
        target: 'github',
        type: 'SECRET',
        scope: 'ENVIRONMENT',
        name: 'OPENCRVS_METABASE_ADMIN_EMAIL'
      }
    ]
  },
  {
    id: 'metabaseAdminPassword',
    screen: 'advanced',
    subScreen: 'application',
    section: 'Metabase Administration',
    label: 'OPENCRVS_METABASE_ADMIN_PASSWORD',
    description: 'Password for the Metabase super administrator.',
    control: 'password',
    required: true,
    generatedDefault: 'password',
    source: {
      target: 'github',
      scope: 'ENVIRONMENT',
      name: 'OPENCRVS_METABASE_ADMIN_PASSWORD'
    },
    bindings: [
      {
        target: 'github',
        type: 'SECRET',
        scope: 'ENVIRONMENT',
        name: 'OPENCRVS_METABASE_ADMIN_PASSWORD'
      }
    ]
  },
  {
    id: 'smtpEnabled',
    screen: 'application',
    section: 'SMTP Configuration',
    label: 'SMTP Enabled',
    description: 'Configure SMTP details for OpenCRVS emails and alerts.',
    control: 'checkbox',
    requires: ['github'],
    defaultValue: false,
    source: { target: 'state', name: 'smtpEnabled' },
    bindings: []
  },
  {
    id: 'smtpHost',
    screen: 'application',
    section: 'SMTP Configuration',
    label: 'SMTP_HOST',
    description: 'SMTP server hostname.',
    control: 'password',
    required: true,
    visibleWhen: { fieldId: 'smtpEnabled', equals: true },
    source: { target: 'github', scope: 'ENVIRONMENT', name: 'SMTP_HOST' },
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'ENVIRONMENT', name: 'SMTP_HOST' }
    ]
  },
  {
    id: 'smtpUsername',
    screen: 'application',
    section: 'SMTP Configuration',
    label: 'SMTP_USERNAME',
    description: 'Username used to authenticate with the SMTP server.',
    control: 'password',
    required: true,
    visibleWhen: { fieldId: 'smtpEnabled', equals: true },
    source: { target: 'github', scope: 'ENVIRONMENT', name: 'SMTP_USERNAME' },
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'ENVIRONMENT', name: 'SMTP_USERNAME' }
    ]
  },
  {
    id: 'smtpPassword',
    screen: 'application',
    section: 'SMTP Configuration',
    label: 'SMTP_PASSWORD',
    description: 'Password used to authenticate with the SMTP server.',
    control: 'password',
    required: true,
    visibleWhen: { fieldId: 'smtpEnabled', equals: true },
    source: { target: 'github', scope: 'ENVIRONMENT', name: 'SMTP_PASSWORD' },
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'ENVIRONMENT', name: 'SMTP_PASSWORD' }
    ]
  },
  {
    id: 'smtpPort',
    screen: 'application',
    section: 'SMTP Configuration',
    label: 'SMTP_PORT',
    description: 'Port used to connect to the SMTP server.',
    control: 'password',
    required: true,
    visibleWhen: { fieldId: 'smtpEnabled', equals: true },
    source: { target: 'github', scope: 'ENVIRONMENT', name: 'SMTP_PORT' },
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'ENVIRONMENT', name: 'SMTP_PORT' }
    ]
  },
  {
    id: 'smtpSecure',
    screen: 'application',
    section: 'SMTP Configuration',
    label: 'SMTP_SECURE',
    description: 'Whether the SMTP connection uses TLS.',
    control: 'checkbox',
    defaultValue: false,
    visibleWhen: { fieldId: 'smtpEnabled', equals: true },
    source: { target: 'github', scope: 'ENVIRONMENT', name: 'SMTP_SECURE' },
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'ENVIRONMENT', name: 'SMTP_SECURE' }
    ]
  },
  {
    id: 'senderEmailAddress',
    screen: 'application',
    section: 'SMTP Configuration',
    label: 'SENDER_EMAIL_ADDRESS',
    description: 'Email address used as the sender for OpenCRVS emails.',
    control: 'password',
    required: true,
    visibleWhen: { fieldId: 'smtpEnabled', equals: true },
    source: {
      target: 'github',
      scope: 'ENVIRONMENT',
      name: 'SENDER_EMAIL_ADDRESS'
    },
    bindings: [
      {
        target: 'github',
        type: 'SECRET',
        scope: 'ENVIRONMENT',
        name: 'SENDER_EMAIL_ADDRESS'
      }
    ]
  },
  {
    id: 'alertEmail',
    screen: 'application',
    section: 'SMTP Configuration',
    label: 'ALERT_EMAIL',
    description: 'Email address or Slack channel email link used for alerts.',
    control: 'password',
    required: true,
    visibleWhen: { fieldId: 'smtpEnabled', equals: true },
    source: { target: 'github', scope: 'ENVIRONMENT', name: 'ALERT_EMAIL' },
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'ENVIRONMENT', name: 'ALERT_EMAIL' }
    ]
  },
  {
    id: 'dependenciesMonitoringEnabled',
    screen: 'dependencies',
    section: 'Monitoring',
    label: 'Enable monitoring',
    description: 'Deploy the OpenCRVS dependency monitoring stack.',
    control: 'checkbox',
    defaultValue: true,
    source: {
      target: 'helm',
      chart: 'dependencies',
      path: 'monitoring.enabled'
    },
    bindings: [
      {
        target: 'helm',
        chart: 'dependencies',
        path: 'monitoring.enabled',
        omitWhenDefault: true
      }
    ]
  },
  {
    id: 'elastalertNotificationType',
    screen: 'dependencies',
    section: 'Monitoring',
    label: 'Elastalert notification type',
    description: 'How to send alerts from Elastalert.',
    control: 'select',
    requires: ['helm'],
    required: true,
    defaultValue: 'email',
    options: [
      { label: 'email', value: 'email' },
      { label: 'Post call to Countryconfig', value: 'post2' },
    ],
    visibleWhen: { fieldId: 'dependenciesMonitoringEnabled', equals: true },
    source: { target: 'state', name: 'elastalertNotificationType' },
    bindings: []
  },
  {
    id: 'elasticsearchEnabled',
    screen: 'dependencies',
    section: 'Elasticsearch',
    label: 'Deploy Elasticsearch',
    description: 'Deploy Elasticsearch with the OpenCRVS dependencies chart.',
    control: 'checkbox',
    defaultValue: true,
    source: { target: 'helm', chart: 'dependencies', path: 'elasticsearch.enabled' },
    bindings: [
      { target: 'helm', chart: 'dependencies', path: 'elasticsearch.enabled', omitWhenDefault: true }
    ]
  },
  {
    id: 'elasticsearchHost',
    screen: 'dependencies',
    section: 'Elasticsearch',
    label: 'Host',
    description: 'External Elasticsearch hostname.',
    control: 'text',
    required: true,
    defaultValue: 'elasticsearch.opencrvs-deps-dev.svc.cluster.local',
    visibleWhen: { fieldId: 'elasticsearchEnabled', equals: false },
    source: { target: 'helm', chart: 'opencrvs-services', path: 'elasticsearch.host' },
    bindings: [
      { target: 'helm', chart: 'opencrvs-services', path: 'elasticsearch.host' }
    ]
  },
  {
    id: 'elasticsearchPort',
    screen: 'dependencies',
    section: 'Elasticsearch',
    label: 'Port',
    description: 'External Elasticsearch port.',
    control: 'number',
    required: true,
    defaultValue: 9200,
    validator: 'positive-integer',
    visibleWhen: { fieldId: 'elasticsearchEnabled', equals: false },
    source: { target: 'helm', chart: 'opencrvs-services', path: 'elasticsearch.port' },
    bindings: [
      { target: 'helm', chart: 'opencrvs-services', path: 'elasticsearch.port' }
    ]
  },
  {
    id: 'elasticsearchUsername',
    screen: 'dependencies',
    section: 'Elasticsearch',
    label: 'ELASTICSEARCH_SUPERUSER_USERNAME',
    description: 'Administrator username for external Elasticsearch.',
    control: 'password',
    required: true,
    generatedDefault: 'username',
    visibleWhen: { fieldId: 'elasticsearchEnabled', equals: false },
    source: { target: 'github', scope: 'ENVIRONMENT', name: 'ELASTICSEARCH_SUPERUSER_USERNAME' },
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'ENVIRONMENT', name: 'ELASTICSEARCH_SUPERUSER_USERNAME' }
    ]
  },
  {
    id: 'elasticsearchPassword',
    screen: 'dependencies',
    section: 'Elasticsearch',
    label: 'ELASTICSEARCH_SUPERUSER_PASSWORD',
    description: 'Automatically generated Elasticsearch administrator password.',
    control: 'password',
    required: true,
    generatedDefault: 'password',
    readonly: true,
    source: { target: 'github', scope: 'ENVIRONMENT', name: 'ELASTICSEARCH_SUPERUSER_PASSWORD' },
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'ENVIRONMENT', name: 'ELASTICSEARCH_SUPERUSER_PASSWORD' }
    ]
  },
  {
    id: 'postgresEnabled',
    screen: 'dependencies',
    section: 'PostgreSQL',
    label: 'Deploy PostgreSQL',
    description: 'Deploy PostgreSQL with the OpenCRVS dependencies chart.',
    control: 'checkbox',
    defaultValue: true,
    source: { target: 'helm', chart: 'dependencies', path: 'postgres.enabled' },
    bindings: [
      { target: 'helm', chart: 'dependencies', path: 'postgres.enabled', omitWhenDefault: true }
    ]
  },
  {
    id: 'postgresHost',
    screen: 'dependencies',
    section: 'PostgreSQL',
    label: 'Host',
    description: 'External PostgreSQL hostname.',
    control: 'text',
    required: true,
    defaultValue: 'postgres-0.postgres.opencrvs-deps-dev.svc.cluster.local',
    visibleWhen: { fieldId: 'postgresEnabled', equals: false },
    source: { target: 'helm', chart: 'opencrvs-services', path: 'postgres.host' },
    bindings: [
      { target: 'helm', chart: 'opencrvs-services', path: 'postgres.host' }
    ]
  },
  {
    id: 'postgresPort',
    screen: 'dependencies',
    section: 'PostgreSQL',
    label: 'Port',
    description: 'External PostgreSQL port.',
    control: 'number',
    required: true,
    defaultValue: 5432,
    validator: 'positive-integer',
    visibleWhen: { fieldId: 'postgresEnabled', equals: false },
    source: { target: 'helm', chart: 'opencrvs-services', path: 'postgres.port' },
    bindings: [
      { target: 'helm', chart: 'opencrvs-services', path: 'postgres.port' }
    ]
  },
  {
    id: 'postgresSslmode',
    screen: 'dependencies',
    section: 'PostgreSQL',
    label: 'SSL mode',
    description: 'TLS verification mode for external PostgreSQL connections.',
    control: 'select',
    required: true,
    defaultValue: 'disable',
    options: [
      { label: 'Disable', value: 'disable' },
      { label: 'Allow', value: 'allow' },
      { label: 'Prefer', value: 'prefer' },
      { label: 'Require', value: 'require' },
      { label: 'Verify CA', value: 'verify-ca' },
      { label: 'Verify full', value: 'verify-full' }
    ],
    visibleWhen: { fieldId: 'postgresEnabled', equals: false },
    source: { target: 'helm', chart: 'opencrvs-services', path: 'postgres.sslmode' },
    bindings: [
      { target: 'helm', chart: 'opencrvs-services', path: 'postgres.sslmode' }
    ]
  },
  {
    id: 'postgresUsername',
    screen: 'dependencies',
    section: 'PostgreSQL',
    label: 'POSTGRES_USER',
    description: 'Automatically generated PostgreSQL administrator username.',
    control: 'password',
    required: true,
    generatedDefault: 'username',
    readonly: true,
    source: { target: 'github', scope: 'ENVIRONMENT', name: 'POSTGRES_USER' },
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'ENVIRONMENT', name: 'POSTGRES_USER' }
    ]
  },
  {
    id: 'postgresPassword',
    screen: 'dependencies',
    section: 'PostgreSQL',
    label: 'POSTGRES_PASSWORD',
    description: 'Automatically generated PostgreSQL administrator password.',
    control: 'password',
    required: true,
    generatedDefault: 'password',
    readonly: true,
    source: { target: 'github', scope: 'ENVIRONMENT', name: 'POSTGRES_PASSWORD' },
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'ENVIRONMENT', name: 'POSTGRES_PASSWORD' }
    ]
  },
  {
    id: 'minioEnabled',
    screen: 'dependencies',
    section: 'MinIO',
    label: 'Deploy MinIO',
    description: 'Deploy MinIO with the OpenCRVS dependencies chart.',
    control: 'checkbox',
    defaultValue: true,
    source: { target: 'helm', chart: 'dependencies', path: 'minio.enabled' },
    bindings: [
      { target: 'helm', chart: 'dependencies', path: 'minio.enabled', omitWhenDefault: true }
    ]
  },
  {
    id: 'minioHost',
    screen: 'dependencies',
    section: 'MinIO',
    label: 'Host',
    description: 'External MinIO hostname.',
    control: 'text',
    required: true,
    defaultValue: 'minio-0.minio.opencrvs-deps-dev.svc.cluster.local',
    visibleWhen: { fieldId: 'minioEnabled', equals: false },
    source: { target: 'helm', chart: 'opencrvs-services', path: 'minio.host' },
    bindings: [
      { target: 'helm', chart: 'opencrvs-services', path: 'minio.host' }
    ]
  },
  {
    id: 'minioPort',
    screen: 'dependencies',
    section: 'MinIO',
    label: 'Port',
    description: 'External MinIO port.',
    control: 'number',
    required: true,
    defaultValue: 3535,
    validator: 'positive-integer',
    visibleWhen: { fieldId: 'minioEnabled', equals: false },
    source: { target: 'helm', chart: 'opencrvs-services', path: 'minio.port' },
    bindings: [
      { target: 'helm', chart: 'opencrvs-services', path: 'minio.port', skipPathValidation: true }
    ]
  },
  {
    id: 'minioUsername',
    screen: 'dependencies',
    section: 'MinIO',
    label: 'MINIO_ROOT_USER',
    description: 'Automatically generated MinIO root username.',
    control: 'password',
    required: true,
    generatedDefault: 'username',
    readonly: true,
    source: { target: 'github', scope: 'ENVIRONMENT', name: 'MINIO_ROOT_USER' },
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'ENVIRONMENT', name: 'MINIO_ROOT_USER' }
    ]
  },
  {
    id: 'minioPassword',
    screen: 'dependencies',
    section: 'MinIO',
    label: 'MINIO_ROOT_PASSWORD',
    description: 'Automatically generated MinIO root password.',
    control: 'password',
    required: true,
    generatedDefault: 'password',
    readonly: true,
    source: { target: 'github', scope: 'ENVIRONMENT', name: 'MINIO_ROOT_PASSWORD' },
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'ENVIRONMENT', name: 'MINIO_ROOT_PASSWORD' }
    ]
  },
  {
    id: 'redisEnabled',
    screen: 'dependencies',
    section: 'Redis',
    label: 'Deploy Redis',
    description: 'Deploy Redis with the OpenCRVS dependencies chart.',
    control: 'checkbox',
    defaultValue: true,
    source: { target: 'helm', chart: 'dependencies', path: 'redis.enabled' },
    bindings: [
      { target: 'helm', chart: 'dependencies', path: 'redis.enabled', omitWhenDefault: true }
    ]
  },
  {
    id: 'redisHost',
    screen: 'dependencies',
    section: 'Redis',
    label: 'Host',
    description: 'External Redis hostname.',
    control: 'text',
    required: true,
    defaultValue: 'redis-0.redis.opencrvs-deps-dev.svc.cluster.local',
    visibleWhen: { fieldId: 'redisEnabled', equals: false },
    source: { target: 'helm', chart: 'opencrvs-services', path: 'redis.host' },
    bindings: [
      { target: 'helm', chart: 'opencrvs-services', path: 'redis.host' }
    ]
  },
  {
    id: 'redisPort',
    screen: 'dependencies',
    section: 'Redis',
    label: 'Port',
    description: 'External Redis port.',
    control: 'number',
    required: true,
    defaultValue: 6379,
    validator: 'positive-integer',
    visibleWhen: { fieldId: 'redisEnabled', equals: false },
    source: { target: 'helm', chart: 'opencrvs-services', path: 'redis.port' },
    bindings: [
      { target: 'helm', chart: 'opencrvs-services', path: 'redis.port', skipPathValidation: true }
    ]
  },
  {
    id: 'dependenciesMemoryLimit',
    screen: 'advanced',
    subScreen: 'dependencies',
    section: 'Dependencies / Resources',
    label: 'Default memory limit',
    description: 'Default container memory limit for dependency workloads.',
    control: 'text',
    defaultValue: '8Gi',
    validator: 'kubernetes-memory',
    source: {
      target: 'helm',
      chart: 'dependencies',
      path: 'resources.memoryLimit'
    },
    bindings: [
      {
        target: 'helm',
        chart: 'dependencies',
        path: 'resources.memoryLimit',
        omitWhenDefault: true
      }
    ]
  },
  {
    id: 'servicesHpaMaxReplicas',
    screen: 'advanced',
    subScreen: 'application',
    section: 'OpenCRVS Services / Autoscaling',
    label: 'Maximum replicas',
    description: 'Maximum replica count used by the default HPA policy.',
    control: 'number',
    defaultValue: 2,
    validator: 'positive-integer',
    source: {
      target: 'helm',
      chart: 'opencrvs-services',
      path: 'hpa.maxReplicas'
    },
    bindings: [
      {
        target: 'helm',
        chart: 'opencrvs-services',
        path: 'hpa.maxReplicas',
        omitWhenDefault: true
      }
    ]
  }
]

export function getConfigurationFields(screen: ConfigurationScreen) {
  return CONFIGURATION_FIELDS.filter((field) => field.screen === screen)
}

export function validateConfigurationSchema() {
  const screenIds = new Set<string>()
  for (const screen of CONFIGURATION_SCREENS) {
    if (screenIds.has(screen.id)) {
      throw new Error(`Duplicate configuration screen id: ${screen.id}`)
    }
    screenIds.add(screen.id)

    const subScreenIds = new Set<string>()
    for (const subScreen of screen.subScreens || []) {
      if (subScreenIds.has(subScreen.id)) {
        throw new Error(
          `Duplicate sub-screen id ${subScreen.id} on screen ${screen.id}`
        )
      }
      subScreenIds.add(subScreen.id)
    }
  }

  const fieldIds = new Set<string>()
  for (const field of CONFIGURATION_FIELDS) {
    if (fieldIds.has(field.id)) {
      throw new Error(`Duplicate configuration field id: ${field.id}`)
    }
    fieldIds.add(field.id)

    const screen = CONFIGURATION_SCREENS.find(({ id }) => id === field.screen)
    if (!screen) {
      throw new Error(
        `Configuration field ${field.id} references unknown screen ${field.screen}`
      )
    }
    if (
      field.subScreen &&
      !screen.subScreens?.some(({ id }) => id === field.subScreen)
    ) {
      throw new Error(
        `Configuration field ${field.id} references unknown sub-screen ${field.subScreen} on screen ${field.screen}`
      )
    }
  }
}
