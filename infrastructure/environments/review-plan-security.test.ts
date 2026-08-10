import assert from 'assert'

import { buildReviewPlan } from './review-plan'

const secretValue = 'must-not-appear-in-review'
const plan = buildReviewPlan({
  environmentName: 'development',
  deploymentFeatures: ['github'],
  // Exercise compatibility with an unsafe legacy request. The result must
  // remain redacted even when this flag is true.
  includeSecretValues: true,
  githubUpdates: {
    variables: [],
    secrets: [
      {
        scope: 'ENVIRONMENT',
        type: 'SECRET',
        name: 'EXAMPLE_SECRET',
        value: secretValue,
        exists: false,
        action: 'create'
      }
    ]
  },
  inventoryValues: null,
  chartValues: null,
  helmUpdates: []
})

assert.strictEqual(plan.secrets.length, 1)
assert(!('value' in plan.secrets[0]))
assert(!JSON.stringify(plan).includes(secretValue))

console.log('review plan security tests passed')
