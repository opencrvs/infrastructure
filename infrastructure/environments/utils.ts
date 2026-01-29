import {
  Secret,
  Variable
} from './github'

export function generateLongPassword() {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let result = ''
  for (let i = 16; i > 0; --i)
    result += chars[Math.floor(Math.random() * chars.length)]
  return result
}

export function findExistingValue<T extends string>(
  name: string,
  type: T,
  scope: 'ENVIRONMENT' | 'REPOSITORY',
  existingValues: Array<Secret | Variable>
) {
  return existingValues.find(
    (value) =>
      value.name === name && value.type === type && value.scope === scope
  ) as
    | (T extends 'SECRET' ? Secret : T extends 'VARIABLE' ? Variable : never)
    | undefined
}