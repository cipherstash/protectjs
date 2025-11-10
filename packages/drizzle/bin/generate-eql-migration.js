#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  let migrationPath = null;
  const args = process.argv.slice(2);
  
  // Parse arguments
  let migrationName = 'install-eql';
  let drizzleDir = 'drizzle';
  let showHelp = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      showHelp = true;
    } else if (arg === '--name' || arg === '-n') {
      migrationName = args[++i];
    } else if (arg === '--out' || arg === '-o') {
      drizzleDir = args[++i];
    }
  }

  if (showHelp) {
    console.log(`
Usage: generate-eql-migration [options]

Generate a Drizzle migration that installs CipherStash EQL

Options:
  -n, --name <name>    Migration name (default: "install-eql")
  -o, --out <dir>      Output directory (default: "drizzle")
  -h, --help           Display this help message

Examples:
  npx generate-eql-migration
  npx generate-eql-migration --name setup-eql
  npx generate-eql-migration --out migrations
  
  # Or with your package manager:
  pnpm generate-eql-migration
  yarn generate-eql-migration
  bun generate-eql-migration
`);
    process.exit(0);
  }

  console.log('🔐 Generating EQL migration for Drizzle...\n');

  // Step 1: Generate custom migration with drizzle-kit
  try {
    console.log(`📝 Generating custom migration: ${migrationName}`);
    execSync(`npx drizzle-kit generate --custom --name=${migrationName}`, {
      stdio: 'inherit'
    });
  } catch (error) {
    console.error('❌ Failed to generate custom migration');
    console.error('Make sure drizzle-kit is installed in your project.');
    process.exit(1);
  }

  try {
    // Step 2: Find the SQL file from @cipherstash/schema package
    const schemaPackagePath = resolve(__dirname, '../../schema');
    const sqlFileName = 'cipherstash-encrypt-2-1-8.sql';
    const sqlSourcePath = join(schemaPackagePath, sqlFileName);

    if (!existsSync(sqlSourcePath)) {
      throw new Error(`Could not find EQL SQL file at: ${sqlSourcePath}`);
    }

    // Step 3: Read the EQL SQL content
    const eqlSql = readFileSync(sqlSourcePath, 'utf-8');

    // Step 4: Find the generated migration file and write EQL SQL to it
    // Drizzle generates migrations in format: 0001_migration_name.sql
    const drizzlePath = resolve(process.cwd(), drizzleDir);
    
    if (!existsSync(drizzlePath)) {
      throw new Error(`Drizzle directory not found: ${drizzlePath}\nMake sure to run this command from your project root.`);
    }

    // Find the latest migration file with the specified name
    const fs = await import('node:fs/promises');
    const files = await fs.readdir(drizzlePath);
    const migrationFile = files
      .filter(f => f.endsWith('.sql') && f.includes(migrationName))
      .sort()
      .pop();

    if (!migrationFile) {
      throw new Error(`Could not find migration file for: ${migrationName}\nLooked in: ${drizzlePath}`);
    }

    migrationPath = join(drizzlePath, migrationFile);
    console.log(`\n📄 Writing EQL SQL to: ${migrationFile}`);
    
    writeFileSync(migrationPath, eqlSql, 'utf-8');

    console.log('\n✅ Successfully created EQL migration!');
    console.log('\nNext steps:');
    console.log(`  1. Review the migration: ${migrationPath}`);
    console.log('  2. Run migrations: npx drizzle-kit migrate');
    console.log('     (or use your package manager: pnpm/yarn/bun drizzle-kit migrate)');
  } catch (error) {
    // Cleanup: remove the migration file if it was created
    if (migrationPath && existsSync(migrationPath)) {
      try {
        unlinkSync(migrationPath);
        console.error(`\n🗑️  Cleaned up migration file: ${migrationPath}`);
      } catch (cleanupError) {
        console.error(`\n⚠️  Failed to cleanup migration file: ${migrationPath}`);
      }
    }
    throw error;
  }
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
