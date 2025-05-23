---
"@cipherstash/nextjs": major
"@cipherstash/protect": minors
---

Implemented CipherStash CRN in favor of workspace ID.

- Replaces the environment variable `CS_WORKSPACE_ID` with `CS_WORKSPACE_CRN`
- Replaces `workspace_id` with `workspace_crn` in the `cipherstash.toml` file
