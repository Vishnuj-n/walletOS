# Environment Setup Guide

This guide explains the .env configuration for WalletOS.

## Simplified Structure

WalletOS uses **3 root-level .env files**:

- **`.env`** - Development and production environment (uses Supabase Postgres for database)
- **`.env.test`** - Testing environment (uses local Docker database)
- **`.env.example`** - Template with instructions

**Development/production** connects to Supabase Postgres. Admin auth is handled locally via email/password (bcrypt) with `adm_` session tokens, no Supabase Auth dependency.

## How to Configure

### Step 1: Get Credentials

1. Go to your Supabase dashboard: https://supabase.com/dashboard
2. Navigate to your project
3. Go to **Settings → Database**
4. Copy **Connection String (Transaction Pooler)** → Use for `DATABASE_URL`
5. Copy **Connection String (Direct)** → Use for `DIRECT_URL`
6. Configure SMTP credentials for admin invite emails (Gmail, SendGrid, etc.)

### Step 2: Update .env Files

Edit `.env` for development/production:

```env
# Database Connection (Remote Supabase)
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:6543/postgres?pgbouncer=true&sslmode=require"
DIRECT_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres?sslmode=require"

# SMTP for Admin Invite Emails
GLOBAL_SMTP_HOST="smtp.gmail.com"
GLOBAL_SMTP_PORT=465
GLOBAL_SMTP_SECURE="true"
GLOBAL_SMTP_USER="your-email@gmail.com"
GLOBAL_SMTP_PASS="your-app-password"
ADMIN_CLAIM_REDIRECT_URL="http://localhost:3000"

# CORS (fallback origins if per-tenant config is empty)
CORS_ORIGINS="http://localhost:3000,http://localhost:4200"

# Admin Dashboard (client-side)
NEXT_PUBLIC_API_URL="http://localhost:3333/api/v1"

NODE_ENV="development"
```

Edit `.env.test` for testing (uses local Docker database):

```env
# Database Connection (Local Docker - port 6543 for test)
DATABASE_URL="postgresql://postgres:password@localhost:6543/walletos_test"
DIRECT_URL="postgresql://postgres:password@localhost:6543/walletos_test"

# SMTP for Admin Invite Emails (mocked in tests)
ADMIN_CLAIM_REDIRECT_URL="http://localhost:3000"

NODE_ENV="test"
```

## Test Postgres Container

A local PostgreSQL container is used for fast integration tests. The container runs on port **6543** and is defined in `docker-compose.yml` at the repo root.

### Starting and Migrating the Database

```bash
# 1. Start the container from repo root
docker compose up -d
# wait for healthcheck to pass

# 2. Run migrations on the test database
cd apps/api
npx dotenv-cli -e ../../.env.test -- npx prisma migrate dev
```

The connection string in `.env.test` already points to this container:

```env
DATABASE_URL="postgresql://postgres:password@localhost:6543/walletos_test"
```

To stop the container after testing (from the repo root):

```bash
docker compose down
```

**Note:** For production deployment, use CI/CD environment variables instead of committing `.env` files.

### Step 3: Run Database Migrations

```bash
# From apps/api directory
cd apps/api
npx prisma migrate dev
```

## Testing

### Option 1: Fast Unit Tests (Default)

Default behavior - tests use mocked mail service:

```bash
# Run tests
npx nx test api
```

**Pros:**
- Fast (no network calls)
- No need for real SMTP setup
- Good for unit testing business logic

**Cons:**
- Doesn't test actual email delivery

### Option 2: Password Hashing for Direct Setup

For creating admin users without the invite flow (dev/test only):

```bash
npx ts-node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('your_test_password', 12).then(console.log)"
```

Use the resulting hash as `passwordHash` in the `AdminUser` table for direct login.

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
# All tests
npx nx run-many -t test

# API test suite
npx nx test api

# Admin test suite
npx nx test admin
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

- Never commit `.env` or `.env.test` files - use CI/CD secrets for deployment
- Never commit real credentials to `.env.example`
- `GLOBAL_SMTP_PASS` is your email app password - keep it secret
- `DATABASE_URL` and `DIRECT_URL` contain database credentials - keep them secret
- `NEXT_PUBLIC_*` variables are exposed to the browser - use only public values

## Troubleshooting

### "prepared statement already exists" error

This happens when using the direct connection instead of the pooler. Ensure:
- `DATABASE_URL` uses port 6543 (pgbouncer)
- `DATABASE_URL` includes `?pgbouncer=true`
- `DIRECT_URL` is used ONLY for `npx prisma migrate` commands

### Tests fail with database errors

- Check that Docker is running and the test container is up: `docker ps`
- Verify `.env.test` has correct local database connection string
- Ensure migrations are up to date: `npx dotenv-cli -e ../../.env.test -- npx prisma migrate dev`

### Connection refused errors

- Verify Supabase project is active (not paused)
- Check that your IP is allowed in Supabase network settings
- Ensure SSL mode is set correctly in connection strings
