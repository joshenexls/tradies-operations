import { createDb, type Db } from '@tradies/db'

let db: Db | undefined

export function getDb(): Db {
  if (!db) db = createDb()
  return db
}

/** Test seam — pipeline functions accept a db, tasks resolve it here. */
export function setDbForTesting(instance: Db): void {
  db = instance
}
