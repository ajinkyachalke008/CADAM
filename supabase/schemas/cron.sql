-- Enable pg_cron extension (already enabled on Supabase hosted, needed for local dev)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Daily free tier token reset
-- Runs at midnight UTC, resets expired free-tier subscription tokens to 50 with a 1-day expiry
SELECT cron.schedule(
    'reset-free-tier-tokens',
    '0 0 * * *',
    $$SELECT public.reset_free_tier_tokens()$$
);
