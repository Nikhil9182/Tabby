// scripts/inspect-schema.mjs
// Inspects live Supabase PostgreSQL schema to verify table existence and structure safely.
// Never mutates, drops, or alters any tables or records.

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Read .env if present
const envPath = path.resolve(process.cwd(), '.env');
const envVars = {};

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        envVars[key] = val;
      }
    }
  }
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || envVars.VITE_SUPABASE_URL;
const supabaseKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  envVars.VITE_SUPABASE_PUBLISHABLE_KEY ||
  envVars.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY.');
  process.exit(1);
}

const client = createClient(supabaseUrl, supabaseKey);

const EXPECTED_TABLES = [
  'profiles',
  'groups',
  'group_members',
  'group_invitations',
  'personal_expenses',
  'group_expenses',
  'expense_splits',
  'settlements',
  'categories',
  'currency_rates_cache',
  'friendships',
];

async function main() {
  console.log(`\n🔍 Connecting to Supabase: ${supabaseUrl}`);
  console.log('🛡️  Running safe, read-only schema inspection...\n');

  let passed = 0;
  let failed = 0;

  for (const table of EXPECTED_TABLES) {
    try {
      const { data, error } = await client.from(table).select('*').limit(1);

      if (error) {
        console.log(`  ❌ [${table}]: Error -> ${error.message} (code: ${error.code})`);
        failed++;
      } else {
        console.log(`  ✅ [${table}]: Verified (active & accessible)`);
        passed++;
      }
    } catch (err) {
      console.log(`  ❌ [${table}]: Exception -> ${err.message}`);
      failed++;
    }
  }

  console.log(`\n📋 Inspection Summary: ${passed}/${EXPECTED_TABLES.length} tables verified.`);

  if (failed > 0) {
    console.error(`⚠️  ${failed} tables failed inspection. Check migrations.`);
    process.exit(1);
  } else {
    console.log(`✨ All ${EXPECTED_TABLES.length} Tabby tables exist and are healthy. No reset required.\n`);
  }
}

main().catch((err) => {
  console.error('Fatal error during schema inspection:', err);
  process.exit(1);
});
