import '../server/core/config.js';
// Load dotenv once, then remove any operator signup policy before test imports.
// Empty values are invalid in the real app; only this test preload clears them.
for(const key of ['PAPERWAKE_SIGNUP_POLICY_JSON','PAPERWAKE_SIGNUP_POLICY_VERSION','PAPERWAKE_SIGNUP_POLICY_SHA256'])delete process.env[key];
// Each serial test file receives its own database counter namespace. App
// instances inside that file still share and enforce the same request limits.
process.env.FOLIO_RATE_LIMIT_NAMESPACE = `test-${process.pid}`;
