import type {
  ConfigurationField,
  FieldBinding,
  HelmBinding,
  HelmChart
} from './configuration-fields'
import type { ConfigurationValue } from './configuration-state'
import {
  getNestedValue,
  valuesEqual
} from './configuration-state'

export type HelmUpdate = {
  chart: HelmChart
  path: string
  value: ConfigurationValue
  action: 'remove' | 'set' | 'unchanged'
}

export type HelmPlanInput = {
  enabled: boolean
  fields: ConfigurationField[]
  helmBaseOverrides: Partial<Record<HelmChart, Record<string, unknown>>>
  getFieldValue: (field: ConfigurationField) => ConfigurationValue
  isFieldEnabled: (field: ConfigurationField) => boolean
  isFieldActive: (field: ConfigurationField) => boolean
  getActiveBindings: (field: ConfigurationField) => FieldBinding[]
}

export function buildHelmUpdates(input: HelmPlanInput): HelmUpdate[] {
  if (!input.enabled) {
    return []
  }

  return input.fields.flatMap((field) => {
    if (!input.isFieldEnabled(field)) {
      return []
    }

    const value = input.getFieldValue(field)

    return input.getActiveBindings(field)
      .filter((binding): binding is HelmBinding => binding.target === 'helm')
      .map((binding) => {
        const currentValue = getNestedValue(
          input.helmBaseOverrides[binding.chart] || {},
          binding.path
        )
        const shouldRemove =
          !input.isFieldActive(field) ||
          Boolean(binding.omitWhenDefault && valuesEqual(value, field.defaultValue))
        const action = shouldRemove
          ? currentValue === undefined
            ? 'unchanged'
            : 'remove'
          : valuesEqual(currentValue, value)
            ? 'unchanged'
            : 'set'

        return {
          chart: binding.chart,
          path: binding.path,
          value,
          action
        }
      })
  })
}
