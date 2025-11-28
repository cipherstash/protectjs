/**
 * Seed data for documentation examples.
 * This data matches the examples in docs/reference/drizzle/*.md
 *
 * ## Date Strategy
 * Uses relative dates (days before test run) to ensure tests remain valid
 * regardless of when they're executed. Documentation examples use relative
 * concepts like "recent transactions" rather than specific dates.
 *
 * ## Seed Data to Documentation Section Mapping
 *
 * | Record | Account | Amount | Description | Used In |
 * |--------|---------|--------|-------------|---------|
 * | 0 | 1234567890 | 800.00 | Salary deposit | drizzle.md: "Equality Matching", "Combined Queries" |
 * | 1 | 0987654321 | 150.00 | Gym membership | drizzle.md: "Free Text Search" (ilike 'gym') |
 * | 2 | 1234567890 | 1250.00 | Rent payment | drizzle.md: "Range Queries" (amount > 1000) |
 * | 3-11 | various | various | various | drizzle.md: "Ordering Results", pagination examples |
 * | 12 | 1010101010 | 60.00 | Gym supplements | drizzle.md: "Free Text Search" (second gym match) |
 * | 13 | 1212121212 | 2000.00 | Bonus deposit | drizzle.md: "Range Queries" (high amount) |
 * | 14 | 1313131313 | 35.00 | Book purchase | drizzle.md: "Range Queries" (low amount) |
 *
 * ## Maintenance
 * When updating documentation examples:
 * 1. Check which seed records the example depends on (see mapping above)
 * 2. Update seed data if new values are needed
 * 3. Update the mapping table to reflect changes
 * 4. Run tests to verify examples still work
 */

// Helper to create dates relative to test execution
function daysAgo(days: number): number {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(10, 0, 0, 0) // Normalize to 10:00 UTC
  return date.getTime()
}

export const docSeedData = [
  {
    account: '1234567890',
    amount: 800.0,
    description: 'Salary deposit',
    createdAt: daysAgo(10), // ~10 days ago
  },
  {
    account: '0987654321',
    amount: 150.0,
    description: 'Gym membership payment',
    createdAt: daysAgo(13), // ~13 days ago
  },
  {
    account: '1234567890',
    amount: 1250.0,
    description: 'Rent payment',
    createdAt: daysAgo(5), // ~5 days ago
  },
  {
    account: '5555555555',
    amount: 75.0,
    description: 'Coffee subscription',
    createdAt: daysAgo(7), // ~7 days ago
  },
  {
    account: '1111111111',
    amount: 200.0,
    description: 'Internet payment',
    createdAt: daysAgo(11), // ~11 days ago
  },
  {
    account: '2222222222',
    amount: 50.0,
    description: 'Streaming service',
    createdAt: daysAgo(9), // ~9 days ago
  },
  {
    account: '3333333333',
    amount: 1500.0,
    description: 'Car payment',
    createdAt: daysAgo(3), // ~3 days ago
  },
  {
    account: '4444444444',
    amount: 300.0,
    description: 'Insurance payment',
    createdAt: daysAgo(14), // ~14 days ago
  },
  {
    account: '6666666666',
    amount: 25.0,
    description: 'App subscription',
    createdAt: daysAgo(2), // ~2 days ago
  },
  {
    account: '7777777777',
    amount: 500.0,
    description: 'Utility payment',
    createdAt: daysAgo(6), // ~6 days ago
  },
  {
    account: '8888888888',
    amount: 100.0,
    description: 'Phone payment',
    createdAt: daysAgo(12), // ~12 days ago
  },
  {
    account: '9999999999',
    amount: 450.0,
    description: 'Grocery payment',
    createdAt: daysAgo(8), // ~8 days ago
  },
  {
    account: '1010101010',
    amount: 60.0,
    description: 'Gym supplements',
    createdAt: daysAgo(1), // ~1 day ago
  },
  {
    account: '1212121212',
    amount: 2000.0,
    description: 'Bonus deposit',
    createdAt: daysAgo(4), // ~4 days ago
  },
  {
    account: '1313131313',
    amount: 35.0,
    description: 'Book purchase',
    createdAt: daysAgo(15), // ~15 days ago (oldest)
  },
]
