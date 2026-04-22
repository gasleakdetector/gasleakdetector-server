-- Gas Leak Detector — Supabase schema
-- Run once in Supabase SQL Editor

create table if not exists public.devices (
  id         text primary key,
  name       text,
  lat        double precision,
  lng        double precision,
  created_at timestamptz default now()
);

-- ESP writes raw sensor readings here; realtime subscription reads from this table
create table if not exists public.gas_logs_raw (
  id         bigserial    primary key,
  device_id  text         not null,
  gas_ppm    double precision not null,
  status     text         not null,
  ip_address text,
  created_at timestamptz  not null default now(),

  constraint gas_logs_raw_status_check
    check (status in ('normal', 'warning', 'danger'))
);

create index if not exists idx_raw_device_time on public.gas_logs_raw (device_id, created_at desc);
create index if not exists idx_raw_created     on public.gas_logs_raw (created_at desc);

do $$ begin
  alter publication supabase_realtime add table public.gas_logs_raw;
exception when duplicate_object then null;
end $$;

create table if not exists public.gas_logs_minute (
  id           bigserial    primary key,
  device_id    text         not null,
  bucket       timestamptz  not null,
  avg_gas      double precision,
  min_gas      double precision,
  max_gas      double precision,
  sample_count integer,
  status       text,

  constraint gas_logs_minute_unique unique (device_id, bucket)
);

create index if not exists idx_minute_device_bucket on public.gas_logs_minute (device_id, bucket desc);

create table if not exists public.gas_logs_hour (
  id           bigserial    primary key,
  device_id    text         not null,
  bucket       timestamptz  not null,
  avg_gas      double precision,
  min_gas      double precision,
  max_gas      double precision,
  sample_count integer,

  constraint gas_logs_hour_unique unique (device_id, bucket)
);

create index if not exists idx_hour_device_bucket on public.gas_logs_hour (device_id, bucket desc);

-- Aggregates last 2 minutes of raw rows into per-minute buckets.
-- Status uses worst-case: any danger row in the bucket → bucket is danger.
create or replace function public.aggregate_gas_minute()
returns void language sql security definer as $$
  insert into public.gas_logs_minute
    (device_id, bucket, avg_gas, min_gas, max_gas, sample_count, status)
  select
    device_id,
    date_trunc('minute', created_at) as bucket,
    round(avg(gas_ppm)::numeric, 2)::float8,
    min(gas_ppm),
    max(gas_ppm),
    count(*)::integer,
    case
      when max(case status when 'danger'  then 2 when 'warning' then 1 else 0 end) = 2 then 'danger'
      when max(case status when 'warning' then 1 else 0 end) = 1 then 'warning'
      else 'normal'
    end
  from public.gas_logs_raw
  where created_at >= now() - interval '10 minutes'
    and created_at <  date_trunc('minute', now())
  group by device_id, date_trunc('minute', created_at)
  on conflict (device_id, bucket) do update
    set avg_gas      = excluded.avg_gas,
        min_gas      = excluded.min_gas,
        max_gas      = excluded.max_gas,
        sample_count = excluded.sample_count,
        status       = excluded.status;
$$;

-- Aggregates last 2 hours of minute rows into per-hour buckets.
create or replace function public.aggregate_gas_hour()
returns void language sql security definer as $$
  insert into public.gas_logs_hour
    (device_id, bucket, avg_gas, min_gas, max_gas, sample_count)
  select
    device_id,
    date_trunc('hour', bucket) as bucket,
    round(avg(avg_gas)::numeric, 2)::float8,
    min(min_gas),
    max(max_gas),
    sum(sample_count)::integer
  from public.gas_logs_minute
  where bucket >= now() - interval '4 hours'
    and bucket <  date_trunc('hour', now())
  group by device_id, date_trunc('hour', bucket)
  on conflict (device_id, bucket) do update
    set avg_gas      = excluded.avg_gas,
        min_gas      = excluded.min_gas,
        max_gas      = excluded.max_gas,
        sample_count = excluded.sample_count;
$$;

-- pg_cron: runs inside Supabase, no Vercel invocations needed
create extension if not exists pg_cron;

-- Deletes 'normal' rows from gas_logs_raw that are older than 48 hours.
-- 'warning' and 'danger' rows are kept indefinitely for audit purposes.
-- Safe to run repeatedly; returns the number of rows deleted.
create or replace function public.purge_normal_logs()
returns integer language plpgsql security definer as $$
declare
  deleted_count integer;
begin
  delete from public.gas_logs_raw
  where status     = 'normal'
    and created_at < now() - interval '48 hours';

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- Safe re-run: drop existing jobs before re-scheduling
select cron.unschedule('aggregate-gas-minute') where exists (select 1 from cron.job where jobname = 'aggregate-gas-minute');
select cron.unschedule('aggregate-gas-hour')   where exists (select 1 from cron.job where jobname = 'aggregate-gas-hour');
select cron.unschedule('purge-normal-logs')    where exists (select 1 from cron.job where jobname = 'purge-normal-logs');

select cron.schedule('aggregate-gas-minute', '* * * * *',   $$ select public.aggregate_gas_minute(); $$);
select cron.schedule('aggregate-gas-hour',   '1 * * * *',   $$ select public.aggregate_gas_hour(); $$);
-- Runs daily at 03:00 UTC
select cron.schedule('purge-normal-logs',    '0 3 * * *',   $$ select public.purge_normal_logs(); $$);

alter table public.gas_logs_raw    enable row level security;
alter table public.gas_logs_minute enable row level security;
alter table public.gas_logs_hour   enable row level security;
alter table public.devices         enable row level security;

drop policy if exists "anon read raw"     on public.gas_logs_raw;
drop policy if exists "anon read minute"  on public.gas_logs_minute;
drop policy if exists "anon read hour"    on public.gas_logs_hour;
drop policy if exists "anon read devices" on public.devices;

create policy "anon read raw"     on public.gas_logs_raw    for select using (true);
create policy "anon read minute"  on public.gas_logs_minute for select using (true);
create policy "anon read hour"    on public.gas_logs_hour   for select using (true);
create policy "anon read devices" on public.devices         for select using (true);