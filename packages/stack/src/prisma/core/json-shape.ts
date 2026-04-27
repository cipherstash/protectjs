/**
 * Shared phantom slot symbol used to carry the user's JSON shape from
 * `encryptedJson<T>(...)` (authoring) through to
 * `Decrypted<Contract, Model>` (read-side typing).
 *
 * Both the column-type factory and the `Decrypted` helper import this
 * symbol so the type system treats `[JSON_SHAPE]?: T` as the same
 * structural slot. Two separate `declare const X: unique symbol`
 * declarations would be incompatible at the type level.
 */
export declare const JSON_SHAPE: unique symbol
