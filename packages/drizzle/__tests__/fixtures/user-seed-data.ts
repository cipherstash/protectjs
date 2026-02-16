import type { PlaintextUser } from '../integration-test-helpers'

export const userSeedData: PlaintextUser[] = [
  {
    email: 'john.doe@example.com',
    age: 25,
    score: 85,
    profile: {
      name: 'John Doe',
      bio: 'Software engineer with 5 years experience',
      level: 3,
    },
  },
  {
    email: 'jane.smith@example.com',
    age: 30,
    score: 92,
    profile: {
      name: 'Jane Smith',
      bio: 'Senior developer specializing in React',
      level: 4,
    },
  },
  {
    email: 'bob.wilson@example.com',
    age: 35,
    score: 78,
    profile: {
      name: 'Bob Wilson',
      bio: 'Full-stack developer and team lead',
      level: 5,
    },
  },
  {
    email: 'alice.johnson@example.com',
    age: 28,
    score: 88,
    profile: {
      name: 'Alice Johnson',
      bio: 'Frontend specialist with design skills',
      level: 3,
    },
  },
  {
    email: 'jill.smith@example.com',
    age: 22,
    score: 75,
    profile: {
      name: 'Jill Smith',
      bio: 'Backend developer with 3 years experience',
      level: 3,
    },
  },
]
