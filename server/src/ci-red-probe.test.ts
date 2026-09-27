import { describe, expect, it } from 'vitest'

describe('ci red probe', () => {
  it('deliberately fails to prove the CI gate blocks', () => {
    expect(1).toBe(2)
  })
})
