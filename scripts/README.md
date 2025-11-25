# Utility Scripts

This directory contains utility scripts for database operations and debugging.

## Database Scripts (`db/`)

Scripts for database management and user synchronization.

### `npm run db:check`
Checks database connection and lists all users in the database.

**Location**: `scripts/db/check-connection.mjs`

**Usage**:
```bash
npm run db:check
```

**Output**: Table of all users with ID, email, and timestamps.

---

### `npm run db:sync`
Manually syncs the current Clerk user to the database. Use this when Clerk webhooks fail.

**Location**: `scripts/db/quick-sync.mjs`

**Usage**:
```bash
npm run db:sync
```

**When to use**: If you see foreign key errors when creating integrations, the user doesn't exist in the database. Run this to sync.

---

### Other Database Scripts

- **`sync-user.mjs`**: Manual sync with hardcoded user ID (deprecated, use quick-sync instead)
- **`sync-from-clerk.mjs`**: Fetches user from Clerk API and syncs to database

---

## Debug Scripts (`debug/`)

Scripts for troubleshooting integration issues.

### `npm run debug:integrations`
Checks the status of all integrations for the current user.

**Location**: `scripts/debug/check-integrations.mjs`

**Usage**:
```bash
npm run debug:integrations
```

**Output**: Lists all integrations with provider, app, status, and connected account IDs.

---

### Other Debug Scripts

- **`check-user-mismatch.mjs`**: Checks for mismatches between Clerk and database users
- **`fix-user-sync.mjs`**: Attempts to fix user sync issues

---

## Adding New Scripts

When adding new utility scripts:

1. Place them in the appropriate directory:
   - `scripts/db/` for database operations
   - `scripts/debug/` for debugging tools
   - `scripts/deploy/` for deployment tasks (create if needed)

2. Add npm script to `package.json`:
   ```json
   "scripts": {
     "db:your-script": "node scripts/db/your-script.mjs"
   }
   ```

3. Document the script in this README.

4. Use `.mjs` extension for ES modules (required for `import` statements).

5. Load environment variables:
   ```javascript
   import dotenv from 'dotenv';
   dotenv.config({ path: '.env.local' });
   ```
