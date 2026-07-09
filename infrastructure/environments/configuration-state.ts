import { randomInt } from 'crypto'

import type {
  ConfigurationField,
  DerivedValueCondition
} from './configuration-fields'

export type ConfigurationValue = string | number | boolean
export type ConfigurationContext = {
  environmentType: string
}

export type DerivedFieldState = {
  value: ConfigurationValue
  locked: boolean
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function getNestedValue(
  source: Record<string, unknown>,
  pathValue: string
) {
  return pathValue.split('.').reduce<unknown>((current, segment) => {
    return isRecord(current) ? current[segment] : undefined
  }, source)
}

export function setNestedValue(
  target: Record<string, unknown>,
  pathValue: string,
  value: ConfigurationValue
) {
  const segments = pathValue.split('.')
  const finalSegment = segments.pop()!
  let current = target

  for (const segment of segments) {
    if (!isRecord(current[segment])) {
      current[segment] = {}
    }
    current = current[segment] as Record<string, unknown>
  }

  current[finalSegment] = value
}

export function deleteNestedValue(
  target: Record<string, unknown>,
  pathValue: string
) {
  const segments = pathValue.split('.')

  function remove(current: Record<string, unknown>, index: number): boolean {
    const segment = segments[index]

    if (index === segments.length - 1) {
      delete current[segment]
    } else if (isRecord(current[segment])) {
      const child = current[segment] as Record<string, unknown>
      if (remove(child, index + 1)) {
        delete current[segment]
      }
    }

    return Object.keys(current).length === 0
  }

  remove(target, 0)
}

export function valuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function generateCredential(kind: 'username' | 'password') {
  const characters = kind === 'username'
    ? 'abcdefghijklmnopqrstuvwxyz'
    : 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const length = kind === 'username' ? 8 : 16

  return Array.from(
    { length },
    () => characters[randomInt(characters.length)]
  ).join('')
}

export function createFieldDefaultValueResolver() {
  const generatedFieldValues = new Map<string, string>()

  return function getFieldDefaultValue(
    field: ConfigurationField,
    environmentName = ''
  ) {
    if (field.generatedDefault) {
      const cacheKey = `${environmentName}:${field.id}`
      const existingValue = generatedFieldValues.get(cacheKey)
      if (existingValue) {
        return existingValue
      }

      const generatedValue = generateCredential(field.generatedDefault)
      generatedFieldValues.set(cacheKey, generatedValue)
      return generatedValue
    }

    if (typeof field.defaultValue === 'string' && environmentName) {
      return field.defaultValue.replace(
        'opencrvs-deps-dev',
        `opencrvs-deps-${environmentName}`
      )
    }

    return field.defaultValue ?? ''
  }
}

export function getDerivedFieldState(
  field: ConfigurationField,
  conditionMatches: (condition: DerivedValueCondition) => boolean
): DerivedFieldState | null {
  const rule = field.deriveValue?.find(({ when }) => conditionMatches(when))

  return rule
    ? {
        value: rule.value,
        locked: Boolean(rule.lock)
      }
    : null
}

export function getSubmittedOrDerivedFieldValue(
  field: ConfigurationField,
  submitted: unknown,
  current: ConfigurationValue,
  derivedState: DerivedFieldState | null
) {
  if (derivedState?.locked) {
    return derivedState.value
  }

  return field.readonly || submitted === undefined ? current : submitted
}

export function getResponseValuesForFields(
  fields: ConfigurationField[],
  values: Record<string, unknown>,
  getConfigurationFieldValue: (field: ConfigurationField) => ConfigurationValue
) {
  const nextValues = { ...values }

  for (const field of fields) {
    nextValues[field.id] = getConfigurationFieldValue(field)
  }

  return nextValues
}
