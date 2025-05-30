# Searching Encrypted Data with Supabase SDK

When working with encrypted data in Supabase, you can use the standard Supabase SDK methods by properly formatting the encrypted payload as a string.
The Supabase JS SDK uses [PostREST](https://docs.postgrest.org/en/v13/) under the hood, and working with composite types is not well supported, so we plan to support a proper `@cipherstash/supabase` package that will provide a more robust interface for working with encrypted data in Supabase.

Upvote this [issue](https://github.com/cipherstash/protectjs/issues/135) and follow along for updates.

> [!NOTE]
> The following assumes you have installed the [latest version of the EQL v2 extension](https://github.com/cipherstash/encrypt-query-language/releases).
> You can also install the extension using the [dbdev](https://database.dev/cipherstash/eql) tool.

## Exposing EQL schema

These instructions are referenced from the [Supabase docs](https://supabase.com/docs/guides/api/using-custom-schemas) and are used to expose the EQL schema to the Supabase SDK.

1. Go to [API settings](https://supabase.com/dashboard/project/_/settings/api) and add `eql_v2` to "Exposed schemas".
2. Then run the following in the Supabase project as raw SQL:

```sql
GRANT USAGE ON SCHEMA eql_v2 TO anon, authenticated, service_role;Add commentMore actions
GRANT ALL ON ALL TABLES IN SCHEMA eql_v2 TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA eql_v2 TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA eql_v2 TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA eql_v2 GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA eql_v2 GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA eql_v2 GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
```

## Converting Encrypted Search Terms

When searching encrypted data, you need to convert the encrypted payload into a format that PostgreSQL and the Supabase SDK can understand. The encrypted payload needs to be converted to a raw composite type format by double stringifying the JSON:

```typescript
const searchTerms = await protectClient.createSearchTerms([
  {
    value: 'billy@example.com',
    column: users.email,
    table: users,
    returnType: 'composite-literal'
  }
])

const searchTerm = searchTerms.data[0]
```

For certain queries, when including the encrypted search term with an operator that uses the string logic syntax, you need to use the 'escaped-composite-literal' return type:

```typescript
const searchTerms = await protectClient.createSearchTerms([
  {
    value: 'billy@example.com',
    column: users.email,
    table: users,
    returnType: 'escaped-composite-literal'
  }
])

const searchTerm = searchTerms.data[0]
```

## Query Examples

Here are examples of different ways to search encrypted data using the Supabase SDK:

### Equality Search

```typescript
const searchTerms = await protectClient.createSearchTerms([
  {
    value: 'billy@example.com',
    column: users.email,
    table: users,
    returnType: 'composite-literal'
  }
])

const { data, error } = await supabase
  .from('users')
  .select('id, email::jsonb, name::jsonb')
  .eq('email', searchTerms.data[0])
```

### Pattern Matching Search

```typescript
const searchTerms = await protectClient.createSearchTerms([
  {
    value: 'example.com',
    column: users.email,
    table: users,
    returnType: 'composite-literal'
  }
])

const { data, error } = await supabase
  .from('users')
  .select('id, email::jsonb, name::jsonb')
  .like('email', searchTerms.data[0])
```

### IN Operator Search

When you need to search for multiple encrypted values, you can use the IN operator. Each encrypted value needs to be properly formatted and combined:

```typescript
// Encrypt multiple search terms
const searchTerms = await protectClient.createSearchTerms([
  {
    value: 'value1',
    column: users.name,
    table: users,
    returnType: 'escaped-composite-literal'
  },
  {
    value: 'value2',
    column: users.name,
    table: users,
    returnType: 'escaped-composite-literal'
  }
])

// Combine terms for IN operator
const { data, error } = await supabase
  .from('users')
  .select('id, email::jsonb, name::jsonb')
  .filter('name', 'in', `(${searchTerms.data[0]},${searchTerms.data[1]})`)
```

### OR Condition Search

You can combine multiple encrypted search conditions using the `.or()` syntax. This is useful when you want to search across multiple encrypted columns:

```typescript
// Encrypt search terms for different columns
const searchTerms = await protectClient.createSearchTerms([
  {
    value: 'user@example.com',
    column: users.email,
    table: users,
    returnType: 'escaped-composite-literal'
  },
  {
    value: 'John',
    column: users.name,
    table: users,
    returnType: 'escaped-composite-literal'
  }
])

// Combine conditions with OR
const { data, error } = await supabase
  .from('users')
  .select('id, email::jsonb, name::jsonb')
  .or(`email.ilike.${searchTerms.data[0]}, name.ilike.${searchTerms.data[1]}`)
```

## Conclusion

The key is in using the appropriate return type for your search terms:
- Use `composite-literal` for simple equality and pattern matching queries
- Use `escaped-composite-literal` when you need to include the search term in string-based operators like IN or OR conditions

You can use these patterns with any of Supabase's query methods like `.eq()`, `.like()`, `.ilike()`, etc.