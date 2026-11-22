import assert from 'node:assert/strict'
import test from 'node:test'
import { carryGuestData, migrateGuestData } from '../src/lib/guestMigration.ts'

function fakeStorage(entries: Record<string, string> = {}) {
  const data = new Map(Object.entries(entries))
  return {
    get length() {
      return data.size
    },
    key(index: number) {
      return [...data.keys()][index] ?? null
    },
    getItem(key: string) {
      return data.get(key) ?? null
    },
    setItem(key: string, value: string) {
      data.set(key, value)
    },
    removeItem(key: string) {
      data.delete(key)
    },
    clear() {
      data.clear()
    },
  }
}

const options = (username = 'ahmed') => ({
  prefix: 'speakout-a2',
  toUserKey: (key: string) => `speakout-a2.u.${username}.${key}`,
})

test('copies guest progress into the new account storage', () => {
  const storage = fakeStorage({ 'speakout-a2.progress.v1': '{"xp":30}' })

  const migrated = migrateGuestData(storage, options())

  assert.deepEqual(migrated, ['speakout-a2.progress.v1'])
  assert.equal(
    storage.getItem('speakout-a2.u.ahmed.speakout-a2.progress.v1'),
    '{"xp":30}',
  )
})

test('keeps existing account progress instead of overwriting it with guest progress', () => {
  const storage = fakeStorage({
    'speakout-a2.progress.v1': '{"xp":30}',
    'speakout-a2.u.ahmed.speakout-a2.progress.v1': '{"xp":90}',
  })

  migrateGuestData(storage, options())

  assert.equal(
    storage.getItem('speakout-a2.u.ahmed.speakout-a2.progress.v1'),
    '{"xp":90}',
  )
})

test('removes a guest key after copying it into the account', () => {
  const storage = fakeStorage({ 'speakout-a2.progress.v1': '{"xp":30}' })

  migrateGuestData(storage, options())

  assert.equal(storage.getItem('speakout-a2.progress.v1'), null)
  assert.equal(
    storage.getItem('speakout-a2.u.ahmed.speakout-a2.progress.v1'),
    '{"xp":30}',
  )
})

test('ignores theme, visitor and already account-scoped keys', () => {
  const storage = fakeStorage({
    'speakout-a2.theme': 'dark',
    'speakout-a2.visitor.v1': 'v-1',
    'speakout-a2.u.ahmed.speakout-a2.progress.v1': '{}',
  })

  assert.deepEqual(migrateGuestData(storage, options()), [])
})

test('queues a sync for every key moved into the account', () => {
  const storage = fakeStorage({
    'speakout-a2.progress.v1': '{}',
    'speakout-a2.milestones.v1': '[]',
  })
  const synced: string[] = []

  carryGuestData(storage, {
    ...options(),
    onMigrated: (key) => synced.push(key),
  })

  assert.deepEqual(synced, [
    'speakout-a2.progress.v1',
    'speakout-a2.milestones.v1',
  ])
})

test('does not break login when browser storage is unavailable', () => {
  const storage = {
    get length() {
      throw new Error('storage blocked')
    },
    key: () => null,
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  }
  let result: string[] | null = null
  try {
    result = carryGuestData(storage, options())
  } catch {
    result = null
  }

  assert.deepEqual(result, [])
})

test('migrates drafts, milestones, reminders and hard words with progress', () => {
  const storage = fakeStorage({
    'speakout-a2.progress.v1': '{}',
    'speakout-a2.writing.draft.2a': 'draft text',
    'speakout-a2.milestones.v1': '[]',
    'speakout-a2.reminder.v1': '{}',
    'speakout-a2.review-hard-words': '{}',
  })

  const migrated = migrateGuestData(storage, options())

  assert.equal(migrated.length, 5)
  assert.equal(
    storage.getItem('speakout-a2.u.ahmed.speakout-a2.writing.draft.2a'),
    'draft text',
  )
  assert.equal(
    storage.getItem('speakout-a2.u.ahmed.speakout-a2.milestones.v1'),
    '[]',
  )
})
