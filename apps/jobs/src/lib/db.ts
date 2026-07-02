import { createDb, type Db } from '@tradies/db'

let db: Db = await createDb()

export function getDb(): Db {
  return db
}

/** Test seam — pipeline functions accept a db, tasks resolve it here. */
export function setDbForTesting(instance: Db): void {
  db = instance
}
