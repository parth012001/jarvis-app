/**
 * Seed Test Emails for Context Builder Testing
 *
 * Creates realistic test data:
 * 1. Email threads (3-5 emails per thread) - tests thread context loading
 * 2. Multiple emails from same senders - tests sender history loading
 * 3. Edge cases: first-time sender, long thread, email with no body
 *
 * Run with: node scripts/test/seed-test-emails.mjs
 */
import { PgVector } from '@mastra/pg';
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';
import { neon } from '@neondatabase/serverless';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const connectionString = process.env.DATABASE_URL;
const INDEX_NAME = 'email_embeddings';

if (!connectionString) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY not set');
  process.exit(1);
}

const sql = neon(connectionString);
const pgVector = new PgVector({ connectionString });

// Test user ID - in production this would be a real Clerk user ID
const TEST_USER_ID = 'test-user-context-builder';

// Generate a date N days ago
function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

// Generate embedding for email content
async function generateEmbedding(content) {
  const { embedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: content,
  });
  return embedding;
}

// Store email in database and vector store
async function storeEmail(email) {
  const emailId = randomUUID();

  // Insert into emails table
  await sql`
    INSERT INTO emails (id, user_id, message_id, thread_id, from_address, to_address, subject, body, snippet, received_at, labels)
    VALUES (
      ${emailId},
      ${email.userId},
      ${email.messageId},
      ${email.threadId},
      ${email.from},
      ${email.to},
      ${email.subject},
      ${email.body},
      ${email.snippet || email.body?.substring(0, 100)},
      ${email.receivedAt},
      ${email.labels || null}
    )
    ON CONFLICT (user_id, message_id) DO NOTHING
  `;

  // Generate and store embedding
  const content = `From: ${email.from}\nSubject: ${email.subject}\n\n${email.body || ''}`.trim();
  if (content.length > 10) {
    const embedding = await generateEmbedding(content);
    await pgVector.upsert({
      indexName: INDEX_NAME,
      vectors: [embedding],
      metadata: [{
        emailId,
        userId: email.userId,
        messageId: email.messageId,
        threadId: email.threadId || null,
        from: email.from,
        subject: email.subject,
        receivedAt: email.receivedAt?.toISOString() || null,
        snippet: content.substring(0, 200),
      }],
    });
  }

  return emailId;
}

// ============================================================================
// TEST DATA DEFINITIONS
// ============================================================================

/**
 * Thread 1: Project Discussion (4 emails)
 * Tests: Thread context loading, chronological ordering
 */
const projectThread = {
  threadId: 'thread-project-q4-2024',
  emails: [
    {
      messageId: 'msg-project-1',
      from: 'Sarah Chen <sarah.chen@company.com>',
      to: 'parth@company.com',
      subject: 'Q4 Project Kickoff',
      body: `Hi Parth,

I wanted to reach out about the Q4 project kickoff. We're planning to start the new initiative next Monday.

Key deliverables:
- Product roadmap by Oct 15
- Technical specs by Oct 20
- First sprint starts Oct 25

Let me know if you have any questions!

Best,
Sarah`,
      receivedAt: daysAgo(14),
    },
    {
      messageId: 'msg-project-2',
      from: 'parth@company.com',
      to: 'sarah.chen@company.com',
      subject: 'Re: Q4 Project Kickoff',
      body: `Hi Sarah,

Thanks for the heads up! The timeline looks good to me.

I've already started gathering requirements from the stakeholders. Should have the initial draft ready by EOD Friday.

One question - who's handling the backend infrastructure piece?

Parth`,
      receivedAt: daysAgo(13),
    },
    {
      messageId: 'msg-project-3',
      from: 'Sarah Chen <sarah.chen@company.com>',
      to: 'parth@company.com',
      subject: 'Re: Q4 Project Kickoff',
      body: `Great question! Mike from the platform team will be leading the infrastructure work. I'll set up a sync meeting for you two this week.

Also, can you loop in the design team? We'll need their input on the user flows.

Thanks,
Sarah`,
      receivedAt: daysAgo(12),
    },
    {
      messageId: 'msg-project-4',
      from: 'parth@company.com',
      to: 'sarah.chen@company.com',
      subject: 'Re: Q4 Project Kickoff',
      body: `Perfect, I'll reach out to the design team today.

Quick update: I've completed the requirements doc and shared it in the project channel. Let me know if you have any feedback.

Looking forward to the sync with Mike!

Parth`,
      receivedAt: daysAgo(11),
    },
  ],
};

/**
 * Thread 2: Meeting Request (3 emails)
 * Tests: Short thread, meeting context
 */
const meetingThread = {
  threadId: 'thread-meeting-sync',
  emails: [
    {
      messageId: 'msg-meeting-1',
      from: 'Alex Kumar <alex.kumar@external.io>',
      to: 'parth@company.com',
      subject: 'Partnership Discussion - Follow Up',
      body: `Hi Parth,

It was great meeting you at the conference last week! I'd love to continue our conversation about potential partnership opportunities.

Are you available for a 30-minute call this week? I'm flexible on timing.

Best regards,
Alex Kumar
Business Development, External.io`,
      receivedAt: daysAgo(7),
    },
    {
      messageId: 'msg-meeting-2',
      from: 'parth@company.com',
      to: 'alex.kumar@external.io',
      subject: 'Re: Partnership Discussion - Follow Up',
      body: `Hi Alex,

Great to hear from you! I really enjoyed our chat as well.

I'm available Thursday 2-4pm or Friday morning. Would either work for you?

Looking forward to diving deeper into the integration possibilities.

Best,
Parth`,
      receivedAt: daysAgo(6),
    },
    {
      messageId: 'msg-meeting-3',
      from: 'Alex Kumar <alex.kumar@external.io>',
      to: 'parth@company.com',
      subject: 'Re: Partnership Discussion - Follow Up',
      body: `Thursday 2pm works perfectly! I'll send a calendar invite shortly.

I'll prepare a brief overview of our API capabilities and some integration examples from similar partnerships.

See you then!
Alex`,
      receivedAt: daysAgo(5),
    },
  ],
};

/**
 * Thread 3: Long Thread (7 emails)
 * Tests: Token budget truncation, long thread handling
 */
const longThread = {
  threadId: 'thread-bug-investigation',
  emails: [
    {
      messageId: 'msg-bug-1',
      from: 'QA Team <qa@company.com>',
      to: 'parth@company.com',
      subject: 'Critical Bug: User Dashboard Crash',
      body: `Priority: HIGH

We've identified a critical bug in production. The user dashboard is crashing when loading analytics data for accounts with more than 1000 transactions.

Steps to reproduce:
1. Log in as test user with large dataset
2. Navigate to dashboard
3. Click "View Analytics"
4. Application crashes

Stack trace attached.

Please investigate ASAP.`,
      receivedAt: daysAgo(10),
    },
    {
      messageId: 'msg-bug-2',
      from: 'parth@company.com',
      to: 'qa@company.com',
      subject: 'Re: Critical Bug: User Dashboard Crash',
      body: `Thanks for the detailed report. I'm looking into this now.

Initial findings: The issue appears to be related to the pagination not being applied correctly when fetching large datasets. The frontend is trying to render all 1000+ records at once.

Will have a fix ready for review within the hour.`,
      receivedAt: daysAgo(10),
    },
    {
      messageId: 'msg-bug-3',
      from: 'QA Team <qa@company.com>',
      to: 'parth@company.com',
      subject: 'Re: Critical Bug: User Dashboard Crash',
      body: `Great catch! Let us know when the fix is ready and we'll run regression tests.

Also, can you add a test case to prevent this from happening again?`,
      receivedAt: daysAgo(10),
    },
    {
      messageId: 'msg-bug-4',
      from: 'parth@company.com',
      to: 'qa@company.com',
      subject: 'Re: Critical Bug: User Dashboard Crash',
      body: `Fix is ready: PR #1234

Changes:
- Added server-side pagination (100 records per page)
- Added client-side virtualization for smooth scrolling
- Added unit test for large dataset scenario

Ready for review whenever you have time.`,
      receivedAt: daysAgo(10),
    },
    {
      messageId: 'msg-bug-5',
      from: 'QA Team <qa@company.com>',
      to: 'parth@company.com',
      subject: 'Re: Critical Bug: User Dashboard Crash',
      body: `Tested the fix. All test cases pass!

One minor issue: The loading indicator doesn't show during pagination. Not a blocker, but would be nice to have.

Approving the PR now.`,
      receivedAt: daysAgo(9),
    },
    {
      messageId: 'msg-bug-6',
      from: 'parth@company.com',
      to: 'qa@company.com',
      subject: 'Re: Critical Bug: User Dashboard Crash',
      body: `Good catch on the loading indicator. I'll add that in a follow-up PR to avoid delaying the critical fix.

Merging now and deploying to production.`,
      receivedAt: daysAgo(9),
    },
    {
      messageId: 'msg-bug-7',
      from: 'QA Team <qa@company.com>',
      to: 'parth@company.com',
      subject: 'Re: Critical Bug: User Dashboard Crash',
      body: `Confirmed fix is live in production. Dashboard is working correctly for large accounts.

Closing this ticket. Thanks for the quick turnaround!`,
      receivedAt: daysAgo(9),
    },
  ],
};

/**
 * Sender History: Frequent Contact (5 separate emails, not a thread)
 * Tests: Sender history loading across different conversations
 */
const frequentSenderEmails = [
  {
    messageId: 'msg-john-1',
    threadId: 'thread-john-1',
    from: 'John Smith <john.smith@partner.org>',
    to: 'parth@company.com',
    subject: 'Invoice for September Services',
    body: `Hi Parth,

Please find attached the invoice for September consulting services.

Total: $5,000
Due: October 15, 2024

Let me know if you have any questions.

John`,
    receivedAt: daysAgo(25),
  },
  {
    messageId: 'msg-john-2',
    threadId: 'thread-john-2',
    from: 'John Smith <john.smith@partner.org>',
    to: 'parth@company.com',
    subject: 'Workshop Materials',
    body: `Hey Parth,

I've uploaded the workshop materials from last week's session to the shared drive.

The team seemed really engaged! Let me know if you'd like to schedule a follow-up session.

Best,
John`,
    receivedAt: daysAgo(18),
  },
  {
    messageId: 'msg-john-3',
    threadId: 'thread-john-3',
    from: 'John Smith <john.smith@partner.org>',
    to: 'parth@company.com',
    subject: 'Holiday Schedule',
    body: `Hi Parth,

Quick heads up - I'll be out of office Dec 23 - Jan 2 for the holidays.

If there's anything urgent, please reach out before Dec 20 so we can address it.

Happy holidays in advance!
John`,
    receivedAt: daysAgo(8),
  },
  {
    messageId: 'msg-john-4',
    threadId: 'thread-john-4',
    from: 'John Smith <john.smith@partner.org>',
    to: 'parth@company.com',
    subject: 'New Service Offering',
    body: `Hi Parth,

I wanted to let you know about a new service we're launching - AI automation consulting.

Given your team's interest in automation, I thought this might be relevant. Would you be interested in a quick demo?

Let me know!
John`,
    receivedAt: daysAgo(3),
  },
  {
    messageId: 'msg-john-5',
    threadId: 'thread-john-5',
    from: 'John Smith <john.smith@partner.org>',
    to: 'parth@company.com',
    subject: 'Coffee next week?',
    body: `Hey Parth,

I'll be in your area next Tuesday. Want to grab coffee and catch up?

Would love to hear how the project is going!

John`,
    receivedAt: daysAgo(1),
  },
];

/**
 * Edge Cases
 */
const edgeCaseEmails = [
  // First-time sender (no history)
  {
    messageId: 'msg-firsttime-1',
    threadId: null, // No thread
    from: 'recruiter@hiring.com',
    to: 'parth@company.com',
    subject: 'Exciting Opportunity at TechCorp',
    body: `Hi Parth,

I came across your profile and was impressed by your experience. We have a Senior Engineer position that might interest you.

Would you be open to a quick call to discuss?

Best regards,
Jamie
Tech Recruiter`,
    receivedAt: daysAgo(2),
  },
  // Email with no body (subject only)
  {
    messageId: 'msg-nobody-1',
    threadId: null,
    from: 'calendar@company.com',
    to: 'parth@company.com',
    subject: 'Reminder: Team Standup in 15 minutes',
    body: null,
    receivedAt: daysAgo(1),
  },
  // Very short email
  {
    messageId: 'msg-short-1',
    threadId: null,
    from: 'manager@company.com',
    to: 'parth@company.com',
    subject: 'Quick question',
    body: 'Can we chat at 3pm?',
    receivedAt: daysAgo(1),
  },
];

// ============================================================================
// MAIN SEEDING FUNCTION
// ============================================================================

async function seedEmails() {
  console.log('🌱 Seeding Test Emails for Context Builder\n');
  console.log('='.repeat(50));

  // First, ensure test user exists (or skip if FK constraint fails)
  console.log('\n📋 Step 1: Check/Create Test User');
  try {
    await sql`
      INSERT INTO users (id, email, first_name, last_name)
      VALUES (${TEST_USER_ID}, 'test-context@example.com', 'Test', 'User')
      ON CONFLICT (id) DO NOTHING
    `;
    console.log(`   ✅ Test user ready: ${TEST_USER_ID}`);
  } catch (error) {
    console.log(`   ⚠️  Could not create user (may already exist): ${error.message}`);
  }

  // Clear existing test data
  console.log('\n📋 Step 2: Clear Existing Test Data');
  try {
    const deleted = await sql`
      DELETE FROM emails WHERE user_id = ${TEST_USER_ID}
    `;
    console.log(`   ✅ Cleared existing test emails`);
  } catch (error) {
    console.log(`   ⚠️  Could not clear: ${error.message}`);
  }

  let totalEmails = 0;
  let totalEmbeddings = 0;

  // Seed Thread 1: Project Discussion
  console.log('\n📋 Step 3: Seed Project Thread (4 emails)');
  for (const email of projectThread.emails) {
    try {
      await storeEmail({
        ...email,
        userId: TEST_USER_ID,
        threadId: projectThread.threadId,
      });
      totalEmails++;
      totalEmbeddings++;
      console.log(`   ✅ ${email.subject.substring(0, 40)}...`);
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
    }
  }

  // Seed Thread 2: Meeting Request
  console.log('\n📋 Step 4: Seed Meeting Thread (3 emails)');
  for (const email of meetingThread.emails) {
    try {
      await storeEmail({
        ...email,
        userId: TEST_USER_ID,
        threadId: meetingThread.threadId,
      });
      totalEmails++;
      totalEmbeddings++;
      console.log(`   ✅ ${email.subject.substring(0, 40)}...`);
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
    }
  }

  // Seed Thread 3: Long Bug Thread
  console.log('\n📋 Step 5: Seed Long Bug Thread (7 emails)');
  for (const email of longThread.emails) {
    try {
      await storeEmail({
        ...email,
        userId: TEST_USER_ID,
        threadId: longThread.threadId,
      });
      totalEmails++;
      totalEmbeddings++;
      console.log(`   ✅ ${email.subject.substring(0, 40)}...`);
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
    }
  }

  // Seed Frequent Sender (John Smith)
  console.log('\n📋 Step 6: Seed Frequent Sender - John Smith (5 emails)');
  for (const email of frequentSenderEmails) {
    try {
      await storeEmail({
        ...email,
        userId: TEST_USER_ID,
      });
      totalEmails++;
      totalEmbeddings++;
      console.log(`   ✅ ${email.subject.substring(0, 40)}...`);
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
    }
  }

  // Seed Edge Cases
  console.log('\n📋 Step 7: Seed Edge Case Emails');
  for (const email of edgeCaseEmails) {
    try {
      await storeEmail({
        ...email,
        userId: TEST_USER_ID,
      });
      totalEmails++;
      if (email.body && email.body.length > 10) totalEmbeddings++;
      console.log(`   ✅ ${email.subject.substring(0, 40)}...`);
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('\n📊 Seeding Complete\n');
  console.log(`   Total Emails: ${totalEmails}`);
  console.log(`   Total Embeddings: ${totalEmbeddings}`);
  console.log(`   Test User: ${TEST_USER_ID}`);
  console.log('\n   Test Data Includes:');
  console.log('   - Project thread (4 emails) - thread context test');
  console.log('   - Meeting thread (3 emails) - short thread test');
  console.log('   - Bug thread (7 emails) - long thread test');
  console.log('   - John Smith (5 emails) - sender history test');
  console.log('   - Edge cases: first-time sender, no body, short email');
  console.log('\n🎉 Ready for context builder testing!\n');
}

// Run the seeder
seedEmails()
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  })
  .finally(() => {
    pgVector.disconnect();
  });
