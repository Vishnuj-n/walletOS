# Test Postgres Container Setup

This document explains how to spin up the local PostgreSQL container used for WalletOS test suite.

## Docker Compose File
The repository already includes a `docker-compose.yml` in the repository root (same level as `package.json`):
```yaml
services:
  test-db:
    image: postgres:15-alpine
    container_name: walletos_test_db
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: walletos_test
    ports:
      - "6543:5432"
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "postgres"]
      interval: 5s
      timeout: 5s
      retries: 5
```

## How It Works
- The container runs PostgreSQL **15** on port **6543** of the host (mapped to the internal `5432`).
- Healthcheck ensures the DB is ready before tests start.
- The connection string is already defined in `.env.test`:
```env
DATABASE_URL="postgresql://postgres:password@localhost:6543/walletos_test"
```

## Starting the Container and Migrating
```bash
# 1. Start the container from repo root
docker compose up -d
# Wait for the healthcheck (a few seconds)

# 2. Run migrations on the test database
cd apps/api
npx dotenv-cli -e ../../.env.test -- npx prisma migrate dev
```

## Running Tests
Once migrations are applied, the test suite automatically picks up `.env.test`. From the repo root, execute:
```bash
 npx nx test api
```

## Stopping the Container
```bash
docker compose down
```

## Common Issues
- **Port conflict**: Ensure no other service is listening on `6543`.
- **Healthcheck failures**: Verify Docker has enough resources; increase `timeout` if needed.
- **Connection refused**: Confirm the container is running (`docker ps`) and the healthcheck passed.

---
*This file lives at `doc/TEST_POSTGRES_SETUP.md` and is referenced from `ENV_SETUP_GUIDE.md`.*
