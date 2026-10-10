import { describe, expect, it } from 'vitest'
import { Cooldown, headPose, isLookingAway, Sustained } from '@/lib/proctor'

/** Minimal landmark array with only the points headPose reads. */
function face(noseX: number, noseY: number) {
  const lm = Array.from({ length: 300 }, () => ({ x: 0, y: 0 }))
  lm[33] = { x: 0.4, y: 0.4 } // left eye
  lm[263] = { x: 0.6, y: 0.4 } // right eye
  lm[152] = { x: 0.5, y: 0.8 } // chin
  lm[1] = { x: noseX, y: noseY } // nose tip
  return lm
}

describe('headPose', () => {
  it('reports a level, centred face as not looking away', () => {
    const p = headPose(face(0.5, 0.58))
    expect(p.yaw).toBeCloseTo(0)
    expect(p.pitch).toBeCloseTo(0.45)
    expect(isLookingAway(p)).toBe(false)
  })
  it('detects a head turned sideways', () => {
    expect(isLookingAway(headPose(face(0.6, 0.58)))).toBe(true)
  })
  it('detects looking down', () => {
    expect(isLookingAway(headPose(face(0.5, 0.72)))).toBe(true)
  })
})

describe('Sustained', () => {
  it('fires once after the condition holds long enough and re-arms when it clears', () => {
    const s = new Sustained(3000)
    expect(s.update(true, 0)).toBe(false)
    expect(s.update(true, 2999)).toBe(false)
    expect(s.update(true, 3000)).toBe(true)
    expect(s.update(true, 9000)).toBe(false)
    expect(s.update(false, 9500)).toBe(false)
    expect(s.update(true, 10000)).toBe(false)
    expect(s.update(true, 13000)).toBe(true)
  })
})

describe('Cooldown', () => {
  it('limits each kind independently', () => {
    const c = new Cooldown(1000)
    expect(c.allow('no_face', 0)).toBe(true)
    expect(c.allow('no_face', 500)).toBe(false)
    expect(c.allow('tab_hidden', 500)).toBe(true)
    expect(c.allow('no_face', 1000)).toBe(true)
  })
})
