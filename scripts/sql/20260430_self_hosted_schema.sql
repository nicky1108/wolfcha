create extension if not exists pgcrypto;

create table if not exists users (
  id text primary key default gen_random_uuid()::text,
  email text not null unique,
  password_hash text,
  user_metadata jsonb not null default '{}'::jsonb,
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_credits (
  id text primary key,
  credits integer not null default 10 check (credits >= 0),
  referral_code text not null unique,
  referred_by text,
  total_referrals integer not null default 0 check (total_referrals >= 0),
  last_daily_bonus_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists referral_records (
  id text primary key default gen_random_uuid()::text,
  referrer_id text not null,
  referred_id text not null,
  referral_code text not null,
  credits_granted integer not null default 0,
  created_at timestamptz not null default now(),
  unique (referred_id)
);

create table if not exists campaign_daily_quota (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  campaign_code text not null,
  quota_date date not null,
  granted_quota integer not null default 0,
  consumed_quota integer not null default 0,
  expires_at timestamptz not null,
  claimed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, campaign_code, quota_date)
);

create table if not exists custom_characters (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  display_name text not null,
  gender text not null check (gender in ('male', 'female', 'nonbinary')),
  age integer not null,
  mbti text not null default 'INFP',
  basic_info text,
  style_label text,
  avatar_seed text,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists demo_config (
  id text primary key,
  enabled boolean not null default false,
  starts_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by text,
  notes text
);

create table if not exists sponsor_clicks (
  id text primary key default gen_random_uuid()::text,
  sponsor_id text not null,
  ref text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists redemption_codes (
  id text primary key default gen_random_uuid()::text,
  code text not null unique,
  credits_amount integer not null default 1,
  is_redeemed boolean not null default false,
  redeemed_by text,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists redemption_records (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  code text not null,
  credits_granted integer not null,
  created_at timestamptz not null default now()
);

create table if not exists game_sessions (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  player_count integer not null,
  difficulty text,
  winner text check (winner is null or winner in ('wolf', 'villager')),
  completed boolean not null default false,
  rounds_played integer not null default 0,
  duration_seconds integer,
  ai_calls_count integer not null default 0,
  ai_input_chars integer not null default 0,
  ai_output_chars integer not null default 0,
  ai_prompt_tokens integer not null default 0,
  ai_completion_tokens integer not null default 0,
  used_custom_key boolean not null default false,
  model_used text,
  user_email text,
  region text,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists payment_transactions (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  stripe_session_id text,
  stripe_payment_intent_id text,
  amount_cents integer,
  currency text,
  quantity integer,
  credits_added integer,
  status text,
  created_at timestamptz not null default now()
);

create unique index if not exists payment_transactions_session_uidx
  on payment_transactions (stripe_session_id)
  where stripe_session_id is not null;

create index if not exists user_credits_referral_code_idx on user_credits (referral_code);
create index if not exists campaign_daily_quota_user_idx on campaign_daily_quota (user_id, campaign_code, quota_date);
create index if not exists custom_characters_user_idx on custom_characters (user_id, created_at desc);
create index if not exists game_sessions_user_idx on game_sessions (user_id, created_at desc);
create index if not exists payment_transactions_user_idx on payment_transactions (user_id, created_at desc);
create index if not exists redemption_records_user_idx on redemption_records (user_id, created_at desc);
create index if not exists sponsor_clicks_sponsor_idx on sponsor_clicks (sponsor_id, created_at desc);

create or replace view sponsor_click_stats as
select
  sponsor_id,
  count(*)::integer as total_clicks,
  count(distinct created_at::date)::integer as active_days,
  max(created_at) as last_click_at
from sponsor_clicks
group by sponsor_id;

insert into demo_config (id, enabled, starts_at, expires_at, notes)
values ('default', false, null, null, 'Self-hosted default config')
on conflict (id) do nothing;
