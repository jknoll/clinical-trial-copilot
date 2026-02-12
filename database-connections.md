# AACT Database Connection

## Overview

The stats panel queries the [AACT (Aggregate Analysis of ClinicalTrials.gov)](https://aact.ctti-clinicaltrials.org/) PostgreSQL database for real-time faceted trial statistics.

## Setup

1. Register for a free account at https://aact.ctti-clinicaltrials.org/users/sign_up
2. Add the connection string to `.env`:
   ```
   AACT_DATABASE_URL=postgresql://{USERNAME}:{PASSWORD}@aact-db.ctti-clinicaltrials.org:5432/aact
   ```
3. Restart the backend — the pool initializes on startup

If `AACT_DATABASE_URL` is not set, the backend logs a warning and stats endpoints return `503`. The chat still works normally.

## Connection Limits

**Hard limit: 10 concurrent connections per user account** (AACT is a shared public resource).

Our asyncpg pool is configured conservatively:
- `min_size=2` — keep 2 idle connections ready
- `max_size=5` — never exceed 5 (leaves room for ad-hoc `psql` sessions)
- `command_timeout=15` — fail fast on slow queries

All connections are properly managed by the pool and closed on shutdown.

If you need more than 10 connections for a special use case, contact CTTI via their [Contact Us](https://aact.ctti-clinicaltrials.org/connect) form.

## Key Tables

All tables are in the `ctgov` schema:

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `studies` | `nct_id`, `overall_status`, `phase` | Main study record |
| `conditions` | `nct_id`, `name`, `downcase_name` | Filter with `ILIKE` on `downcase_name` |
| `eligibilities` | `nct_id`, `gender`, `minimum_age`, `maximum_age` | Age stored as strings like "18 Years" |
| `facilities` | `nct_id`, `city`, `state`, `country`, `latitude`, `longitude` | Geographic filtering |
