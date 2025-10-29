---
"@cipherstash/protect-dynamodb": major
"@cipherstash/protect": major
"@cipherstash/schema": major
---

Added JSON and INT data type support and update FFI to v0.17.1 with x86_64 musl environment platform support.

* Update @cipherstash/protect-ffi from 0.16.0 to 0.17.1 with support for x86_64 musl platforms.
* Add searchableJson() method to schema for JSON field indexing (the search operations still don't work but this interface exists)
* Refactor type system: EncryptedPayload → Encrypted, add JsPlaintext
* Add comprehensive test suites for JSON, integer, and basic encryption
* Update encryption format to use 'k' property for searchable JSON
* Remove deprecated search terms tests for JSON fields
* Simplify schema data types to text, int, json only
* Update model helpers to handle new encryption format
* Fix type safety issues in bulk operations and model encryption