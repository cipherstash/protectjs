---
"@cipherstash/jseql": major
---

Enforced lock context to be called as a proto function rather than an optional argument for crypto functions.
There was a bug that caused the lock context to be interpreted as undefined when the users intention was to use it causing the encryption/decryption to fail.
This is a breaking change for users who were using the lock context as an optional argument.
To use the lock context, call the `withLockContext` method on the encrypt, decrypt, and bulk encrypt/decrypt functions, passing the lock context as a parameter rather than as an optional argument.
