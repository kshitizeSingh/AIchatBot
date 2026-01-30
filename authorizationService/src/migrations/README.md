-- README: Database Migrations

-- This folder contains SQL migration scripts for the Auth Service database.

-- To run migrations:

-- Method 1: Docker (automatic - runs on container start)
-- Migrations are automatically executed from /docker-entrypoint-initdb.d when PostgreSQL starts

-- Method 2: Manual psql
-- psql -h localhost -U fce_user -d fce_auth_db -f 001_initial_schema.sql

-- Method 3: Via Node.js script
-- npm run db:migrate

-- Migration files should be numbered: 001_, 002_, 003_, etc.
-- Each file should be idempotent (safe to run multiple times)
