/**
 * Check if embeddings are stored for emails
 * Run with: node scripts/test/check-embeddings.mjs
 */
import { PgVector } from '@mastra/pg';
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const connectionString = process.env.DATABASE_URL;
const INDEX_NAME = 'email_embeddings';

if (!connectionString) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

const sql = neon(connectionString);
const pgVector = new PgVector({ connectionString });

try {
  // Check emails table
  console.log('📧 Recent emails in database:\n');
  const emails = await sql`
    SELECT id, message_id, from_address, subject, created_at
    FROM emails
    ORDER BY created_at DESC
    LIMIT 5
  `;

  if (emails.length === 0) {
    console.log('   No emails found in database');
  } else {
    emails.forEach((e, i) => {
      console.log(`${i + 1}. ${e.subject || '(no subject)'}`);
      console.log(`   From: ${e.from_address}`);
      console.log(`   ID: ${e.id}`);
      console.log(`   Created: ${e.created_at}`);
      console.log('');
    });
  }

  // Check embeddings table
  console.log('\n📊 Embeddings in vector store:\n');
  const embeddings = await sql`
    SELECT id, metadata
    FROM email_embeddings
    LIMIT 5
  `;

  if (embeddings.length === 0) {
    console.log('   No embeddings found');
  } else {
    embeddings.forEach((e, i) => {
      const meta = e.metadata || {};
      console.log(`${i + 1}. ${meta.subject || '(no subject)'}`);
      console.log(`   From: ${meta.from || 'unknown'}`);
      console.log(`   Email ID: ${meta.emailId || 'unknown'}`);
      console.log('');
    });
  }

  // Summary
  const emailCount = await sql`SELECT COUNT(*) as count FROM emails`;
  const embeddingCount = await sql`SELECT COUNT(*) as count FROM email_embeddings`;

  console.log('\n📈 Summary:');
  console.log(`   Emails stored: ${emailCount[0].count}`);
  console.log(`   Embeddings stored: ${embeddingCount[0].count}`);

  if (emailCount[0].count > embeddingCount[0].count) {
    console.log(`   ⚠️  ${emailCount[0].count - embeddingCount[0].count} email(s) missing embeddings`);
  } else {
    console.log('   ✅ All emails have embeddings');
  }

  console.log('');
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
} finally {
  await pgVector.disconnect();
}
