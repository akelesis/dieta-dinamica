import assert from 'node:assert/strict'
import test from 'node:test'
import { calculatePlan } from '../src/lib/nutrition.ts'
import type { Profile, ReproductiveStatus } from '../src/types.ts'

const profile = (reproductiveStatus: ReproductiveStatus, sex: Profile['sex'] = 'female'): Profile => ({
  name: 'Teste',
  age: 30,
  height: 165,
  weight: 65,
  sex,
  reproductiveStatus,
  goal: 'maintain',
  dailyActivity: 'sedentary',
  workoutsPerWeek: 0,
  workoutMinutes: 0,
  intensity: 'light',
  theme: 'nature',
})

test('aplica os acréscimos calóricos de gestação e amamentação', () => {
  const baseline = calculatePlan(profile('none')).dailyTarget
  const expectedAdjustments: Record<ReproductiveStatus, number> = {
    none: 0,
    pregnant_first_trimester: 0,
    pregnant_second_trimester: 340,
    pregnant_third_trimester: 450,
    breastfeeding_0_6_months: 330,
    breastfeeding_7_12_months: 400,
  }

  for (const [status, adjustment] of Object.entries(expectedAdjustments) as Array<[ReproductiveStatus, number]>) {
    const plan = calculatePlan(profile(status))
    assert.equal(plan.reproductiveCalories, adjustment)
    assert.equal(plan.dailyTarget, baseline + adjustment)
  }
})

test('ignora estado reprodutivo incompatível com sexo masculino', () => {
  const plan = calculatePlan(profile('pregnant_third_trimester', 'male'))
  const baseline = calculatePlan(profile('none', 'male'))
  assert.equal(plan.reproductiveCalories, 0)
  assert.equal(plan.dailyTarget, baseline.dailyTarget)
})
