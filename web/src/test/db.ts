import mongoose from "mongoose";

import { connectDB, disconnectDB } from "@/server/db/connect";
import { syncAllIndexes } from "@/server/models";

/**
 * Whether the dev MongoDB is reachable.
 *
 * Tests skip themselves when it is not, so `npm test` passes on a fresh clone;
 * `REQUIRE_DB=1` (set in CI) turns that into a hard failure instead.
 */
export const dbReachable = await connectDB().then(
  () => true,
  () => false,
);

export const requireDb = process.env.REQUIRE_DB === "1";

/**
 * Empties every collection, so each test starts from a known state.
 *
 * Goes through the driver's collection list rather than the model registry, so
 * it also clears anything a previous run left behind under a name no model
 * declares any more.
 */
export async function clearDatabase(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;

  const collections = await db.listCollections().toArray();
  await Promise.all(
    collections.map((collection) => db.collection(collection.name).deleteMany({})),
  );
}

/**
 * Prepares the database for a test file: indexes built, collections empty.
 *
 * Indexes matter here — `unique: true` is an index, not a validation rule, so
 * uniqueness tests would pass vacuously if the index did not exist yet.
 */
export async function setupTestDatabase(): Promise<void> {
  await connectDB();
  await syncAllIndexes();
  await clearDatabase();
}

export async function teardownTestDatabase(): Promise<void> {
  await clearDatabase();
  await disconnectDB();
}
