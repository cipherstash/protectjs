CREATE TABLE "protect-ci" (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  email eql_v2_encrypted,
  age eql_v2_encrypted,
  score eql_v2_encrypted,
  profile eql_v2_encrypted,
  created_at TIMESTAMP DEFAULT NOW(),
  test_run_id TEXT
);