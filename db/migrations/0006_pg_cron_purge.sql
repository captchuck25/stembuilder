-- Daily hard-purge of rows soft-deleted more than 30 days ago (see 0005).
--
-- PRIMARY scheduler: Supabase pg_cron. Run this in the Supabase SQL editor
-- after 0005. If `create extension` fails, enable "pg_cron" under
-- Database → Extensions in the Supabase dashboard first — or skip this file
-- entirely and rely on the Vercel cron fallback (/api/cron/purge +
-- vercel.json), which calls the same purge function and is equally idempotent.
-- Running both is harmless: the second run finds nothing to purge.

create extension if not exists pg_cron;

-- Re-schedule idempotently (unschedule is a no-op error if absent, so guard it).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-soft-deleted') then
    perform cron.unschedule('purge-soft-deleted');
  end if;
end $$;

-- 03:17 UTC daily. Each run appends a row to retention_purge_log with
-- per-table counts; pg_cron also records runs in cron.job_run_details.
select cron.schedule(
  'purge-soft-deleted',
  '17 3 * * *',
  $$select public.purge_soft_deleted()$$
);
