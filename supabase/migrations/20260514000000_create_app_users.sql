create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

comment on table public.app_users is 'Credenciales custom (bcrypt + JWT jose). Separado de auth.users de Supabase Auth.';

alter table public.app_users enable row level security;

revoke all on public.app_users from anon, authenticated;
