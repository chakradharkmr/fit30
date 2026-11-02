-- Fit30 Reset optional accounts. Safe to run more than once.
-- One row per user holding the whole app state as JSON.
create table if not exists public.fit30_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fit30_accounts_state_is_object check (jsonb_typeof(state) = 'object')
);

alter table public.fit30_accounts enable row level security;

-- No RLS policies by design: browsers cannot read or write this table directly.
-- All access goes through the Netlify Functions, which verify the user's token
-- and use the service role server-side.
revoke all on public.fit30_accounts from anon, authenticated;
grant all on public.fit30_accounts to service_role;
