# Environment Setup Guide

This guide explains the simplified .env configuration for WalletOS and how to properly test with remote Supabase.

## Simplified Structure

After simplification, you now have only **3 root-level .env files**:

- **`.env`** - Development environment (uses remote Supabase)
- **`.env.test`** - Testing environment (uses remote Supabase)
- **`.env.production`** - Production environment (uses remote Supabase)
- **`.env.example`** - Template with instructions

**Deleted files** (removed to eliminate confusion):
- `.env.development` (duplicate of .env)
- `apps/api/.env.example` (app-specific, conflicts with root)
- `apps/api/.env.test` (app-specific, conflicts with root)

## How to Configure

### Step 1: Get Supabase Credentials

1. Go to your Supabase dashboard: https://supabase.com/dashboard
2. Navigate to your project
3. Go to **Settings → Database**
4. Copy **Connection String (Transaction Pooler)** → Use for `DATABASE_URL`
5. Copy **Connection String (Direct)** → Use for `DIRECT_URL`
6. Go to **Settings → API**
7. Copy **Project URL** → Use for `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL`
8. Copy **anon public** key → Use for `NEXT_PUBLIC_SUPABASE_ANON_KEY`
9. Copy **service_role** key → Use for `SUPABASE_SERVICE_ROLE_KEY`

### Step 2: Update .env Files

Edit `.env` for development:

```env
# Database Connection (Remote Supabase)
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:6543/postgres?pgbouncer=true&sslmode=require"
DIRECT_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres?sslmode=require"

# Supabase Auth (for API admin authentication)
SUPABASE_URL="https://[YOUR-PROJECT-REF].supabase.co"
SUPABASE_SERVICE_ROLE_KEY="[YOUR-SERVICE-ROLE-KEY]"

# Admin Dashboard (client-side)
NEXT_PUBLIC_SUPABASE_URL="https://[YOUR-PROJECT-REF].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="[YOUR-ANON-KEY]"
NEXT_PUBLIC_API_URL="http://localhost:3333/api/v1"

NODE_ENV="development"
```

Edit `.env.test` for testing (same as development, but with `NODE_ENV="test"`):

```env
# Same DATABASE_URL, DIRECT_URL, and Supabase credentials as .env
NODE_ENV="test"
```

### Step 3: Run Database Migrations

```bash
# From apps/api directory
cd apps/api
npx prisma migrate dev
```

## Testing with Remote Supabase

### Option 1: Fast Unit Tests (Mocked Supabase)

Default behavior - tests use mocked Supabase for speed:

```bash
# Run tests (uses mocked Supabase by default)
npx nx test api
```

**Pros:**
- Fast (no network calls)
- No need for real Supabase user setup
- Good for unit testing business logic

**Cons:**
- Doesn't test actual Supabase integration
- Mocked responses may not match real behavior

### Option 2: Integration Tests (Real Supabase)

To test with real Supabase authentication:

```bash
# Run tests with real Supabase
TEST_REAL_SUPABASE=true npx nx test api
```

**Before running real Supabase tests:**

1. Create a test admin user in Supabase:
   - Go to Supabase Dashboard → Authentication → Users
   - Create a user with email: `admin@test.com`
   - Set the user's `app_metadata.tenantId` to `default` via SQL:
     ```sql
     update auth.users set app_metadata = '{"tenantId": "default"}' where email = 'admin@test.com';
     ```

2. Get a valid JWT token for this user (you'll need to implement a login endpoint or use Supabase client to generate one)

**Pros:**
- Tests actual Supabase integration
- Catches authentication issues early
- More realistic testing

**Cons:**
- Slower (network calls)
- Requires test user setup
- Tests may be flaky if Supabase is down

## Running the Application

### Development

```bash
# API server
npx nx serve api

# Admin dashboard
npx nx serve admin
```

### Testing

```bash
# All tests (mocked Supabase)
npx nx run-many -t test

# API tests with real Supabase
TEST_REAL_SUPABASE=true npx nx test api

# Admin E2E tests
npx nx e2e admin-e2e
```

### Database Migrations

```bash
# Create migration
cd apps/api
npx prisma migrate dev --name your_migration_name

# Apply migrations to production
npx prisma migrate deploy
```

## Security Notes

⚠️ **IMPORTANT:**

- Never commit `.env` files to git (already in .gitignore)
- Never commit real credentials to `.env.example`
- The `.env.production` file should be set via CI/CD environment variables, not committed
- `SUPABASE_SERVICE_ROLE_KEY` has full admin access - keep it secret
- `NEXT_PUBLIC_*` variables are exposed to the browser - use only public keys

## Troubleshooting

### "prepared statement already exists" error

This happens when using the direct connection instead of the pooler. Ensure:
- `DATABASE_URL` uses port 6543 (pgbouncer)
- `DATABASE_URL` includes `?pgbouncer=true`
- `DIRECT_URL` is used ONLY for `npx prisma migrate` commands

### Tests fail with authentication errors

- Check that `.env.test` has valid Supabase credentials
- If using `TEST_REAL_SUPABASE=true`, ensure test user exists in Supabase
- Verify `SUPABASE_SERVICE_ROLE_KEY` is correct (not anon key)

### Connection refused errors

- Verify Supabase project is active (not paused)
- Check that your IP is allowed in Supabase network settings
- Ensure SSL mode is set correctly in connection strings
