-- Initial database setup for LLM Wiki
-- This file runs once on first container start via docker-entrypoint-initdb.d

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
