# Searching Encrypted Data with Supabase SDK

When working with encrypted data in Supabase, you can use the standard Supabase SDK methods by properly formatting the encrypted payload as a string.
The Supabase JS SDK uses [PostREST](https://docs.postgrest.org/en/v13/) under the hood, and working with composite types is not well supported, so we plan to support a proper `@cipherstash/supabase` package that will provide a more robust interface for working with encrypted data in Supabase.

Upvote this [issue](https://github.com/cipherstash/protectjs/issues/135) and follow along for updates.

> [!NOTE]
> The following assumes you have installed the [latest version of the EQL v2 extension](https://github.com/cipherstash/encrypt-query-language/releases).
> You can also install the extension using the [dbdev](https://database.dev/cipherstash/eql) tool.

## Converting Encrypted Search Terms

When searching encrypted data, you need to convert the encrypted payload into a format that PostgreSQL and the Supabase SDK can understand. The encrypted payload needs to be converted to a raw composite type format by double stringifying the JSON:

```typescript
const searchResult = await protectClient.encrypt('billy@example.com', {
  column: users.email,
  table: users,
})

const searchTerm = `(${JSON.stringify(JSON.stringify(searchResult.data))})`
```

For certain queries, when including the encrypted search term with an operator that uses the string logic syntax, your need to triple stringify the payload.

```typescript
const searchTerm = `${JSON.stringify(`(${JSON.stringify(JSON.stringify(searchResult.data))})`)}`
```

## Query Examples

Here are examples of different ways to search encrypted data using the Supabase SDK:

### Equality Search

```typescript
const searchResult = await protectClient.encrypt('billy@example.com', {
  column: users.email,
  table: users,
})

const searchTerm = `(${JSON.stringify(JSON.stringify(searchResult.data))})`

const { data, error } = await supabase
  .from('users')
  .select('id, email::jsonb, name::jsonb')
  .eq('email', searchTerm)
```

### Pattern Matching Search

```typescript
const searchResult = await protectClient.encrypt('example.com', {
  column: users.email,
  table: users,
})

const searchTerm = `(${JSON.stringify(JSON.stringify(searchResult.data))})`

const { data, error } = await supabase
  .from('users')
  .select('id, email::jsonb, name::jsonb')
  .like('email', searchTerm)
```

### IN Operator Search

When you need to search for multiple encrypted values, you can use the IN operator. Each encrypted value needs to be properly formatted and combined:

```typescript
// Encrypt multiple search terms
const searchResult1 = await protectClient.encrypt('value1', {
  column: users.name,
  table: users,
})

const searchResult2 = await protectClient.encrypt('value2', {
  column: users.name,
  table: users,
})

// Format each search term
const searchTerm = `${JSON.stringify(`(${JSON.stringify(JSON.stringify(searchResult.data))})`)}`
const searchTerm2 = `${JSON.stringify(`(${JSON.stringify(JSON.stringify(searchResult2.data))})`)}`

// Combine terms for IN operator
const { data, error } = await supabase
  .from('users')
  .select('id, email::jsonb, name::jsonb')
  .filter('name', 'in', `(${searchTerm1},${searchTerm2})`)
```

### OR Condition Search

You can combine multiple encrypted search conditions using the `.or()` syntax. This is useful when you want to search across multiple encrypted columns:

```typescript
// Encrypt search terms for different columns
const emailSearch = await protectClient.encrypt('user@example.com', {
  column: users.email,
  table: users,
})

const nameSearch = await protectClient.encrypt('John', {
  column: users.name,
  table: users,
})

// Format each search term
const emailTerm = `${JSON.stringify(`(${JSON.stringify(JSON.stringify(emailSearch.data))})`)}`
const nameTerm = `${JSON.stringify(`(${JSON.stringify(JSON.stringify(nameSearch.data))})`)}`

// Combine conditions with OR
const { data, error } = await supabase
  .from('users')
  .select('id, email::jsonb, name::jsonb')
  .or(`email.ilike.${emailTerm}, name.ilike.${nameTerm}`)
```

## Conclusion

The key is in the string formatting of the encrypted payload: `(${JSON.stringify(JSON.stringify(searchTerm))})`. This ensures the encrypted data is properly formatted for comparison in the database using the EQL custom type. You can use this pattern with any of Supabase's query methods like `.eq()`, `.like()`, `.ilike()`, etc.