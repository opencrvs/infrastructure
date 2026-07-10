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

export type StateBinding = {
  target: 'state'
  name: string
}

export type FieldBinding = AnsibleBinding | GithubBinding | HelmBinding | StateBinding

export type DerivedValueCondition =
  | {
      fieldId: string
      equals: string | number | boolean
    }
  | {
      context: 'environmentType'
      equals: string | number | boolean
    }
  | {
      githubVariable: {
        scope: 'REPOSITORY' | 'ENVIRONMENT'
        name: string
      }
      exists: boolean
    }

export type DerivedValueRule = {
  when: DerivedValueCondition
  value: string | number | boolean
  lock?: boolean
}

export type ConfigurationField = {
  id: string
  screen: ConfigurationScreen
  subScreen?: string
  section: string
  order?: number
  label: string
  description: string
  control: 'checkbox' | 'number' | 'password' | 'select' | 'text' | 'textarea'
  requires?: DeploymentFeature[]
  bindings: FieldBinding[]
  defaultValue?: string | number | boolean
  defaultValueWhen?: DerivedValueRule[]
  deriveValue?: DerivedValueRule[]
  options?: Array<{
    label: string
    value: string
  }>
  required?: boolean
  validator?: 'kubernetes-memory' | 'positive-integer'
  generatedDefault?: 'username' | 'password'
  readonly?: boolean
  readonlyWhen?: Array<{
    when: DerivedValueCondition
  }>
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
    id: 'containerRegistry',
    label: 'Container registry configuration',
    description: 'Configure the country configuration image source used by OpenCRVS deployments.',
    order: 10,
    submitLabel: 'Save container registry',
    savedMessage: 'Container registry configuration saved.',
    nextScreen: 'infrastructure',
    requires: ['github']
  },
  {
    id: 'infrastructure',
    label: 'Infrastructure',
    description: 'Configure the Kubernetes endpoint, worker nodes, API access ranges, and disk encryption settings for this environment.',
    order: 20,
    submitLabel: 'Save infrastructure',
    savedMessage: 'Infrastructure configuration saved.',
    nextScreen: 'application',
    subScreens: [
      { id: 'general', label: 'General', order: 10 },
      { id: 'advanced', label: 'Advanced', order: 20 }
    ],
    requires: ['ansible'],
    customComponents: ['users']
  },
  {
    id: 'application',
    label: 'Application',
    description: 'Configure OpenCRVS domain, Traefik TLS mode, and advanced application values.',
    order: 30,
    submitLabel: 'Save application',
    savedMessage: 'Application configuration saved.',
    nextScreen: 'dependencies',
    subScreens: [
      { id: 'general', label: 'General', order: 10 },
      { id: 'advanced', label: 'Advanced', order: 20 }
    ]
  },
  {
    id: 'dependencies',
    label: 'Dependencies',
    description: 'Choose supporting services, configure external service connections, and tune advanced dependency values.',
    order: 30,
    submitLabel: 'Save dependencies',
    savedMessage: 'Dependency configuration saved.',
    nextScreen: 'review',
    subScreens: [
      { id: 'general', label: 'General', order: 10 },
      { id: 'advanced', label: 'Advanced', order: 20 }
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
    subScreen: 'advanced',
    label: 'Enable disk encryption',
    description: 'Create and store the environment encryption key in GitHub.',
    control: 'checkbox',
    requires: ['github'],
    defaultValue: false,
    defaultValueWhen: [
      {
        when: {
          githubVariable: {
            scope: 'ENVIRONMENT',
            name: 'DISK_SPACE'
          },
          exists: true
        },
        value: true
      },
      {
        when: {
          githubVariable: {
            scope: 'ENVIRONMENT',
            name: 'DISK_SPACE'
          },
          exists: false
        },
        value: false
      }
    ],
    bindings: [{ target: 'state', name: 'enableDiskEncryption' }]
  },
  {
    id: 'diskSpace',
    screen: 'infrastructure',
    subScreen: 'advanced',
    section: 'Disk Encryption',
    label: 'DISK_SPACE',
    description: 'Amount of disk space to dedicate to encrypted OpenCRVS data.',
    control: 'text',
    required: true,
    defaultValue: '200g',
    readonlyWhen: [
      {
        when: {
          githubVariable: {
            scope: 'ENVIRONMENT',
            name: 'DISK_SPACE'
          },
          exists: true
        }
      }
    ],
    visibleWhen: { fieldId: 'enableDiskEncryption', equals: true },
    bindings: [
      { target: 'github', type: 'VARIABLE', scope: 'ENVIRONMENT', name: 'DISK_SPACE',
        omitWhenEmpty: true
      }
    ]
  },
  {
    id: 'domain',
    screen: 'application',
    section: 'OpenCRVS domain and TLS certificate',
    label: 'Domain',
    description: 'Base domain used after OpenCRVS subdomains.',
    control: 'text',
    required: true,
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
    id: 'activateUsers',
    screen: 'application',
    subScreen: 'advanced',
    section: 'OpenCRVS',
    label: 'ACTIVATE_USERS',
    description: 'Whether newly created users should be activated automatically.',
    control: 'checkbox',
    defaultValue: true,
    defaultValueWhen: [
      {
        when: { context: 'environmentType', equals: 'production' },
        value: false
      },
      {
        when: { context: 'environmentType', equals: 'non-production' },
        value: true
      }
    ],
    bindings: [
      {
        target: 'github',
        type: 'VARIABLE',
        scope: 'ENVIRONMENT',
        name: 'ACTIVATE_USERS'
      }
    ]
  },
  {
    id: 'traefikMode',
    screen: 'application',
    section: 'OpenCRVS domain and TLS certificate',
    label: 'Certificate mode',
    description: 'Choose how Traefik obtains and serves the environment certificate.',
    control: 'select',
    required: true,
    defaultValue: 'lets_encrypt',
    options: [
      { label: "Let's Encrypt certificate", value: 'lets_encrypt' },
      { label: 'Static SSL certificate', value: 'static_ssl' },
      { label: 'Custom configuration', value: 'custom' }
    ],
    bindings: [{ target: 'state', name: 'traefikMode' }]
  },
  {
    id: 'sslCrt',
    screen: 'application',
    section: 'OpenCRVS domain and TLS certificate',
    label: 'SSL_CRT',
    description: 'PEM-encoded SSL certificate or certificate chain.',
    control: 'textarea',
    required: true,
    visibleWhen: { fieldId: 'traefikMode', equals: 'static_ssl' },
    existingSecretBehavior: 'replace',
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
    section: 'OpenCRVS domain and TLS certificate',
    label: 'SSL_KEY',
    description: 'PEM-encoded private key for the SSL certificate.',
    control: 'textarea',
    required: true,
    visibleWhen: { fieldId: 'traefikMode', equals: 'static_ssl' },
    existingSecretBehavior: 'replace',
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
    screen: 'containerRegistry',
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
    bindings: [{ target: 'state', name: 'dockerhubMode' }]
  },
  {
    id: 'dockerhubOrganisation',
    screen: 'containerRegistry',
    section: 'Docker Hub',
    label: 'DOCKERHUB_ACCOUNT',
    description: 'Docker Hub account or organisation containing the country configuration image.',
    control: 'password',
    required: true,
    visibleWhen: { fieldId: 'dockerhubMode', equals: 'custom' },
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'REPOSITORY', name: 'DOCKERHUB_ACCOUNT' }
    ]
  },
  {
    id: 'dockerhubRepository',
    screen: 'containerRegistry',
    section: 'Docker Hub',
    label: 'DOCKERHUB_REPO',
    description: 'Docker Hub repository containing the country configuration image.',
    control: 'password',
    required: true,
    visibleWhen: { fieldId: 'dockerhubMode', equals: 'custom' },
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'REPOSITORY', name: 'DOCKERHUB_REPO' }
    ]
  },
  {
    id: 'dockerhubUsername',
    screen: 'containerRegistry',
    section: 'Docker Hub',
    label: 'DOCKER_USERNAME',
    description: 'Username used to authenticate with Docker Hub.',
    control: 'password',
    required: true,
    visibleWhen: { fieldId: 'dockerhubMode', equals: 'custom' },
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'REPOSITORY', name: 'DOCKER_USERNAME' }
    ]
  },
  {
    id: 'dockerhubToken',
    screen: 'containerRegistry',
    section: 'Docker Hub',
    label: 'DOCKER_TOKEN',
    description: 'Access token used to authenticate with Docker Hub.',
    control: 'password',
    required: true,
    visibleWhen: { fieldId: 'dockerhubMode', equals: 'custom' },
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'REPOSITORY', name: 'DOCKER_TOKEN' }
    ]
  },
  {
    id: 'kibanaUsername',
    screen: 'dependencies',
    section: 'Monitoring',
    label: 'KIBANA_USERNAME',
    description: 'Username used to log in to Kibana.',
    control: 'password',
    required: true,
    defaultValue: 'opencrvs-admin',
    visibleWhen: { fieldId: 'dependenciesMonitoringEnabled', equals: true },
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'ENVIRONMENT', name: 'KIBANA_USERNAME' },
    ]
  },
  {
    id: 'kibanaPassword',
    screen: 'dependencies',
    section: 'Monitoring',
    label: 'KIBANA_PASSWORD',
    description: 'Password used to log in to Kibana.',
    control: 'password',
    required: true,
    generatedDefault: 'password',
    visibleWhen: { fieldId: 'dependenciesMonitoringEnabled', equals: true },
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'ENVIRONMENT', name: 'KIBANA_PASSWORD' }
    ]
  },
  {
    id: 'sentryDsn',
    screen: 'dependencies',
    section: 'Monitoring',
    label: 'SENTRY_DSN',
    description: 'Sentry DSN used for application error reporting.',
    control: 'password',
    visibleWhen: { fieldId: 'dependenciesMonitoringEnabled', equals: true },
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'ENVIRONMENT', name: 'SENTRY_DSN' }
    ]
  },
  {
    id: 'backupRestoreMode',
    screen: 'dependencies',
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
    bindings: [{ target: 'state', name: 'backupRestoreMode' }]
  },
  {
    id: 'backupHost',
    screen: 'dependencies',
    section: 'Backup and Restore',
    label: 'BACKUP_HOST',
    description: 'Backup server hostname or IP address.',
    control: 'text',
    required: true,
    visibleWhen: { fieldId: 'backupRestoreMode', equals: 'backup' },
    bindings: [
      { target: 'github', type: 'VARIABLE', scope: 'ENVIRONMENT', name: 'BACKUP_HOST',
        omitWhenEmpty: true
      }
    ]
  },
  {
    id: 'backupUser',
    screen: 'dependencies',
    section: 'Backup and Restore',
    label: 'BACKUP_SERVER_USER',
    description: 'Username used to connect to the backup server.',
    control: 'password',
    defaultValue: 'backup',
    required: true,
    visibleWhen: { fieldId: 'backupRestoreMode', equals: 'backup' },
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'ENVIRONMENT', name: 'BACKUP_SERVER_USER'
      }
    ]
  },
  {
    id: 'backupType',
    screen: 'dependencies',
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
    bindings: [
      { target: 'github', type: 'VARIABLE', scope: 'ENVIRONMENT', name: 'BACKUP_ENVIRONMENT_MODE',
        omitWhenEmpty: true
      }
    ]
  },
  {
    id: 'restoreEnvironmentName',
    screen: 'dependencies',
    section: 'Backup and Restore',
    label: 'RESTORE_ENVIRONMENT_NAME',
    description: 'Environment whose backup should be restored.',
    control: 'text',
    required: true,
    visibleWhen: { fieldId: 'backupRestoreMode', equals: 'restore' },
    bindings: [
      { target: 'github', type: 'VARIABLE', scope: 'ENVIRONMENT', name: 'RESTORE_ENVIRONMENT_NAME',
        omitWhenEmpty: true
      }
    ]
  },
  {
    id: 'restoreType',
    screen: 'dependencies',
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
    bindings: [
      { target: 'github', type: 'VARIABLE', scope: 'ENVIRONMENT', name: 'RESTORE_ENVIRONMENT_MODE',
        omitWhenEmpty: true
      }
    ]
  },
  {
    id: 'metabaseAdminEmail',
    screen: 'dependencies',
    subScreen: 'advanced',
    section: 'Metabase Administration',
    label: 'OPENCRVS_METABASE_ADMIN_EMAIL',
    description: 'Email used as the Metabase super administrator username.',
    control: 'password',
    required: true,
    defaultValue: 'user@opencrvs.org',
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
    screen: 'dependencies',
    subScreen: 'advanced',
    section: 'Metabase Administration',
    label: 'OPENCRVS_METABASE_ADMIN_PASSWORD',
    description: 'Password for the Metabase super administrator.',
    control: 'password',
    required: true,
    generatedDefault: 'password',
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
    bindings: [{ target: 'state', name: 'smtpEnabled' }]
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
    required: true,
    defaultValue: 'email',
    options: [
      { label: 'email', value: 'email' },
      { label: 'Post call to Countryconfig', value: 'post2' },
    ],
    deriveValue: [
      {
        when: { fieldId: 'smtpEnabled', equals: false },
        value: 'post2',
        lock: true
      }
    ],
    visibleWhen: { fieldId: 'dependenciesMonitoringEnabled', equals: true },
    bindings: [{ target: 'state', name: 'elastalertNotificationType' }]
  },
  {
    id: 'elasticsearchEnabled',
    screen: 'dependencies',
    subScreen: 'advanced',
    section: 'Elasticsearch',
    label: 'Deploy Elasticsearch',
    description: 'Deploy Elasticsearch with the OpenCRVS dependencies chart.',
    control: 'checkbox',
    defaultValue: true,
    bindings: [
      { target: 'helm', chart: 'dependencies', path: 'elasticsearch.enabled', omitWhenDefault: true }
    ]
  },
  {
    id: 'elasticsearchHost',
    screen: 'dependencies',
    subScreen: 'advanced',
    section: 'Elasticsearch',
    label: 'Host',
    description: 'External Elasticsearch hostname.',
    control: 'text',
    required: true,
    defaultValue: 'elasticsearch.opencrvs-deps-dev.svc.cluster.local',
    visibleWhen: { fieldId: 'elasticsearchEnabled', equals: false },
    bindings: [
      { target: 'helm', chart: 'opencrvs-services', path: 'elasticsearch.host' }
    ]
  },
  {
    id: 'elasticsearchPort',
    screen: 'dependencies',
    subScreen: 'advanced',
    section: 'Elasticsearch',
    label: 'Port',
    description: 'External Elasticsearch port.',
    control: 'number',
    required: true,
    defaultValue: 9200,
    validator: 'positive-integer',
    visibleWhen: { fieldId: 'elasticsearchEnabled', equals: false },
    bindings: [
      { target: 'helm', chart: 'opencrvs-services', path: 'elasticsearch.port' }
    ]
  },
  {
    id: 'elasticsearchUsername',
    screen: 'dependencies',
    subScreen: 'advanced',
    section: 'Elasticsearch',
    label: 'ELASTICSEARCH_SUPERUSER_USERNAME',
    description: 'Administrator username for external Elasticsearch.',
    control: 'password',
    required: true,
    generatedDefault: 'username',
    visibleWhen: { fieldId: 'elasticsearchEnabled', equals: false },
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'ENVIRONMENT', name: 'ELASTICSEARCH_SUPERUSER_USERNAME' }
    ]
  },
  {
    id: 'elasticsearchPassword',
    screen: 'dependencies',
    subScreen: 'advanced',
    section: 'Elasticsearch',
    label: 'ELASTICSEARCH_SUPERUSER_PASSWORD',
    description: 'Automatically generated Elasticsearch administrator password.',
    control: 'password',
    required: true,
    generatedDefault: 'password',
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'ENVIRONMENT', name: 'ELASTICSEARCH_SUPERUSER_PASSWORD' }
    ]
  },
  {
    id: 'postgresEnabled',
    screen: 'dependencies',
    subScreen: 'advanced',
    section: 'PostgreSQL',
    label: 'Deploy PostgreSQL',
    description: 'Deploy PostgreSQL with the OpenCRVS dependencies chart.',
    control: 'checkbox',
    defaultValue: true,
    bindings: [
      { target: 'helm', chart: 'dependencies', path: 'postgres.enabled', omitWhenDefault: true }
    ]
  },
  {
    id: 'postgresHost',
    screen: 'dependencies',
    subScreen: 'advanced',
    section: 'PostgreSQL',
    label: 'Host',
    description: 'External PostgreSQL hostname.',
    control: 'text',
    required: true,
    defaultValue: 'postgres-0.postgres.opencrvs-deps-dev.svc.cluster.local',
    visibleWhen: { fieldId: 'postgresEnabled', equals: false },
    bindings: [
      { target: 'helm', chart: 'opencrvs-services', path: 'postgres.host' }
    ]
  },
  {
    id: 'postgresPort',
    screen: 'dependencies',
    subScreen: 'advanced',
    section: 'PostgreSQL',
    label: 'Port',
    description: 'External PostgreSQL port.',
    control: 'number',
    required: true,
    defaultValue: 5432,
    validator: 'positive-integer',
    visibleWhen: { fieldId: 'postgresEnabled', equals: false },
    bindings: [
      { target: 'helm', chart: 'opencrvs-services', path: 'postgres.port' }
    ]
  },
  {
    id: 'postgresSslmode',
    screen: 'dependencies',
    subScreen: 'advanced',
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
    bindings: [
      { target: 'helm', chart: 'opencrvs-services', path: 'postgres.sslmode' }
    ]
  },
  {
    id: 'postgresUsername',
    screen: 'dependencies',
    subScreen: 'advanced',
    section: 'PostgreSQL',
    label: 'POSTGRES_USER',
    description: 'Automatically generated PostgreSQL administrator username.',
    control: 'password',
    required: true,
    generatedDefault: 'username',
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'ENVIRONMENT', name: 'POSTGRES_USER' }
    ]
  },
  {
    id: 'postgresPassword',
    screen: 'dependencies',
    subScreen: 'advanced',
    section: 'PostgreSQL',
    label: 'POSTGRES_PASSWORD',
    description: 'Automatically generated PostgreSQL administrator password.',
    control: 'password',
    required: true,
    generatedDefault: 'password',
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'ENVIRONMENT', name: 'POSTGRES_PASSWORD' }
    ]
  },
  {
    id: 'minioEnabled',
    screen: 'dependencies',
    subScreen: 'advanced',
    section: 'MinIO',
    label: 'Deploy MinIO',
    description: 'Deploy MinIO with the OpenCRVS dependencies chart.',
    control: 'checkbox',
    defaultValue: true,
    bindings: [
      { target: 'helm', chart: 'dependencies', path: 'minio.enabled', omitWhenDefault: true }
    ]
  },
  {
    id: 'minioHost',
    screen: 'dependencies',
    subScreen: 'advanced',
    section: 'MinIO',
    label: 'Host',
    description: 'External MinIO hostname.',
    control: 'text',
    required: true,
    defaultValue: 'minio-0.minio.opencrvs-deps-dev.svc.cluster.local',
    visibleWhen: { fieldId: 'minioEnabled', equals: false },
    bindings: [
      { target: 'helm', chart: 'opencrvs-services', path: 'minio.host' }
    ]
  },
  {
    id: 'minioPort',
    screen: 'dependencies',
    subScreen: 'advanced',
    section: 'MinIO',
    label: 'Port',
    description: 'External MinIO port.',
    control: 'number',
    required: true,
    defaultValue: 3535,
    validator: 'positive-integer',
    visibleWhen: { fieldId: 'minioEnabled', equals: false },
    bindings: [
      { target: 'helm', chart: 'opencrvs-services', path: 'minio.port', skipPathValidation: true }
    ]
  },
  {
    id: 'minioUsername',
    screen: 'dependencies',
    subScreen: 'advanced',
    section: 'MinIO',
    label: 'MINIO_ROOT_USER',
    description: 'Automatically generated MinIO root username.',
    control: 'password',
    required: true,
    generatedDefault: 'username',
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'ENVIRONMENT', name: 'MINIO_ROOT_USER' }
    ]
  },
  {
    id: 'minioPassword',
    screen: 'dependencies',
    subScreen: 'advanced',
    section: 'MinIO',
    label: 'MINIO_ROOT_PASSWORD',
    description: 'Automatically generated MinIO root password.',
    control: 'password',
    required: true,
    generatedDefault: 'password',
    bindings: [
      { target: 'github', type: 'SECRET', scope: 'ENVIRONMENT', name: 'MINIO_ROOT_PASSWORD' }
    ]
  },
  {
    id: 'redisEnabled',
    screen: 'dependencies',
    subScreen: 'advanced',
    section: 'Redis',
    label: 'Deploy Redis',
    description: 'Deploy Redis with the OpenCRVS dependencies chart.',
    control: 'checkbox',
    defaultValue: true,
    bindings: [
      { target: 'helm', chart: 'dependencies', path: 'redis.enabled', omitWhenDefault: true }
    ]
  },
  {
    id: 'redisHost',
    screen: 'dependencies',
    subScreen: 'advanced',
    section: 'Redis',
    label: 'Host',
    description: 'External Redis hostname.',
    control: 'text',
    required: true,
    defaultValue: 'redis-0.redis.opencrvs-deps-dev.svc.cluster.local',
    visibleWhen: { fieldId: 'redisEnabled', equals: false },
    bindings: [
      { target: 'helm', chart: 'opencrvs-services', path: 'redis.host' }
    ]
  },
  {
    id: 'redisPort',
    screen: 'dependencies',
    subScreen: 'advanced',
    section: 'Redis',
    label: 'Port',
    description: 'External Redis port.',
    control: 'number',
    required: true,
    defaultValue: 6379,
    validator: 'positive-integer',
    visibleWhen: { fieldId: 'redisEnabled', equals: false },
    bindings: [
      { target: 'helm', chart: 'opencrvs-services', path: 'redis.port', skipPathValidation: true }
    ]
  },
  {
    id: 'dependenciesMemoryLimit',
    screen: 'dependencies',
    subScreen: 'advanced',
    section: 'Dependencies / Resources',
    label: 'Default memory limit',
    description: 'Default container memory limit for dependency workloads.',
    control: 'text',
    defaultValue: '8Gi',
    validator: 'kubernetes-memory',
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
    screen: 'application',
    subScreen: 'advanced',
    section: 'OpenCRVS Services / Autoscaling',
    label: 'Maximum replicas',
    description: 'Maximum replica count used by the default HPA policy.',
    control: 'number',
    defaultValue: 2,
    validator: 'positive-integer',
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
