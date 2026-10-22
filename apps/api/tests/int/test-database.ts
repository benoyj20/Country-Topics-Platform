/** Integration tests wipe their database, so its name must say it is for tests. */
const TEST_DATABASE_NAME_PATTERN = /_test$/;

export function testDatabaseUrl(
  env: Record<string, string | undefined>,
): string {
  const value = env.TEST_DATABASE_URL?.trim();
  if (!value) {
    throw new Error(
      'TEST_DATABASE_URL is not set; run "make env" to add it to .env',
    );
  }

  let databaseName: string;
  try {
    databaseName = new URL(value).pathname.slice(1);
  } catch {
    throw new Error("TEST_DATABASE_URL is not a valid connection URL");
  }

  if (!TEST_DATABASE_NAME_PATTERN.test(databaseName)) {
    throw new Error(
      "TEST_DATABASE_URL must name a database ending in _test; integration tests delete its data",
    );
  }
  return value;
}

/** Integration tests upload files, so their bucket must say it is for tests. */
const TEST_BUCKET_PATTERN = /-test$/;
const DEFAULT_TEST_BUCKET = "countrytopics-test";

export function testBucket(env: Record<string, string | undefined>): string {
  const value = env.TEST_S3_BUCKET?.trim() || DEFAULT_TEST_BUCKET;
  if (!TEST_BUCKET_PATTERN.test(value)) {
    throw new Error(
      "TEST_S3_BUCKET must name a bucket ending in -test; integration tests store files there",
    );
  }
  return value;
}
