import type { ConfigurationField } from './configuration-fields'

export type InventoryUser = {
  name: string
  ssh_keys: string[]
  state: 'present' | 'absent'
  role: 'admin' | 'operator'
}

export type InventoryValue = string | number | boolean | string[] | InventoryUser[]

export type InventoryConfigInput = {
  fields: ConfigurationField[]
  values: Record<string, unknown>
  customValues?: Record<string, InventoryValue>
}

function parseListValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }

  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseBooleanValue(value: unknown) {
  if (typeof value === 'boolean') {
    return value
  }

  return String(value ?? '').trim().toLowerCase() === 'true'
}

function parseNumberValue(value: unknown) {
  if (typeof value === 'number') {
    return value
  }

  return Number(String(value ?? '').trim())
}

function parseAnsibleValue(
  value: unknown,
  type: 'string' | 'boolean' | 'number' | 'list' | 'dict' = 'string'
): InventoryValue {
  if (type === 'list') {
    return parseListValue(value)
  }

  if (type === 'boolean') {
    return parseBooleanValue(value)
  }

  if (type === 'number') {
    return parseNumberValue(value)
  }

  if (type === 'dict') {
    return Array.isArray(value) ? value as InventoryUser[] : []
  }

  return String(value ?? '').trim()
}

export function buildInventoryValues(
  input: InventoryConfigInput
): Record<string, InventoryValue> {
  const values: Record<string, InventoryValue> = {}

  for (const field of input.fields) {
    const ansibleBindings = field.bindings.filter(
      (binding) => binding.target === 'ansible'
    )

    for (const binding of ansibleBindings) {
      values[binding.name] = parseAnsibleValue(
        input.values[field.id],
        binding.type
      )
    }
  }

  return {
    ...values,
    users: [] as InventoryUser[],
    ...input.customValues
  }
}
