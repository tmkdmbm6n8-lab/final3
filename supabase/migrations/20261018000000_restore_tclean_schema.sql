-- Rebuild the TClean application schema for the replacement Supabase project.
-- This migration creates an empty schema; it cannot recover rows from the inaccessible old project.

create extension if not exists pgcrypto;
create type public.app_role as enum ('admin', 'user');

create table public.availability (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  enabled boolean not null default true,
  constraint availability_valid_period check (ends_at > starts_at),
  constraint availability_no_overlap exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&) where (enabled)
);

create table public.business_settings (
  id text primary key default 'main',
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.client_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  request_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.discount_codes (
  code text primary key,
  percent integer not null check (percent between 0 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.form_rate_limits (
  key text primary key,
  attempts integer not null default 0,
  window_started timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  address text not null default '',
  city text not null default '',
  postal_code text not null default '',
  phone text not null default '',
  photo_path text not null default '',
  updated_at timestamptz not null default now()
);

create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  email text not null,
  phone text not null,
  address text not null default '',
  city text not null,
  postal_code text not null,
  details jsonb not null default '{}'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  amount numeric,
  base_amount numeric,
  discount_code text,
  discount_percent integer not null default 0,
  kind text not null default 'quote',
  status text not null default 'pending',
  payment_method text not null default '',
  payment_status text not null default 'unpaid',
  internal_notes text not null default '',
  slot_id uuid references public.availability(id) on delete set null,
  booking_period tstzrange,
  created_at timestamptz not null default now()
);

alter table public.client_notifications
  add constraint client_notifications_request_id_fkey
  foreign key (request_id) references public.quote_requests(id) on delete set null;

create table public.request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.quote_requests(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null default '',
  attachment text not null default '',
  is_admin boolean not null default false,
  is_bot boolean not null default false,
  hidden_for_client boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  author text not null,
  comment text not null default '',
  photo text not null default '',
  rating integer not null check (rating between 1 and 5),
  created_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'user',
  unique (user_id, role)
);

create index quote_requests_created_at_idx on public.quote_requests(created_at desc);
create index quote_requests_user_id_idx on public.quote_requests(user_id);
create index request_messages_request_id_created_at_idx on public.request_messages(request_id, created_at);
create index client_notifications_user_id_created_at_idx on public.client_notifications(user_id, created_at desc);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

create or replace function public.consume_form_attempt(_key text)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  current_attempts integer;
  current_window timestamptz;
begin
  insert into public.form_rate_limits(key, attempts, window_started)
  values (_key, 1, now())
  on conflict (key) do update
    set attempts = case
      when public.form_rate_limits.window_started < now() - interval '15 minutes' then 1
      else public.form_rate_limits.attempts + 1
    end,
    window_started = case
      when public.form_rate_limits.window_started < now() - interval '15 minutes' then now()
      else public.form_rate_limits.window_started
    end
  returning attempts, window_started into current_attempts, current_window;
  return current_attempts <= 5;
end;
$$;

create or replace function public.list_booking_slots()
returns table(id uuid, starts_at timestamptz, ends_at timestamptz, available boolean)
language sql stable security definer
set search_path = ''
as $$
  select a.id, a.starts_at, a.ends_at,
    not exists (
      select 1 from public.quote_requests q
      where q.slot_id = a.id and q.status not in ('cancelled', 'refused', 'expired')
    ) as available
  from public.availability a
  where a.enabled and a.starts_at > now()
  order by a.starts_at;
$$;

create or replace function public.list_open_slots()
returns table(id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select a.id, a.starts_at, a.ends_at
  from public.availability a
  where a.enabled and a.starts_at > now()
    and not exists (
      select 1 from public.quote_requests q
      where q.slot_id = a.id and q.status not in ('cancelled', 'refused', 'expired')
    )
  order by a.starts_at;
$$;

create or replace function public.open_availability_range(_slots jsonb)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  item jsonb;
  inserted_count integer := 0;
  start_value timestamptz;
  end_value timestamptz;
begin
  if jsonb_typeof(_slots) <> 'array' then
    raise exception 'Expected an array of slots';
  end if;
  for item in select value from jsonb_array_elements(_slots)
  loop
    start_value := (item->>'starts_at')::timestamptz;
    end_value := (item->>'ends_at')::timestamptz;
    if start_value > now() and end_value > start_value then
      insert into public.availability(starts_at, ends_at, enabled)
      values (start_value, end_value, true)
      on conflict do nothing;
      if found then inserted_count := inserted_count + 1; end if;
    end if;
  end loop;
  return inserted_count;
end;
$$;

alter table public.availability enable row level security;
alter table public.business_settings enable row level security;
alter table public.client_notifications enable row level security;
alter table public.discount_codes enable row level security;
alter table public.form_rate_limits enable row level security;
alter table public.profiles enable row level security;
alter table public.quote_requests enable row level security;
alter table public.request_messages enable row level security;
alter table public.reviews enable row level security;
alter table public.user_roles enable row level security;

create policy "Public can read business settings" on public.business_settings
  for select to anon, authenticated using (true);
create policy "Admins manage business settings" on public.business_settings
  for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "Public can read enabled availability" on public.availability
  for select to anon, authenticated using (enabled or public.has_role(auth.uid(), 'admin'));
create policy "Admins manage availability" on public.availability
  for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "Users manage their own profile" on public.profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "Public can read reviews" on public.reviews
  for select to anon, authenticated using (true);
create policy "Admins manage reviews" on public.reviews
  for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "Users can read their own role" on public.user_roles
  for select to authenticated using (user_id = auth.uid());

grant usage on schema public to anon, authenticated, service_role;
grant select on public.business_settings, public.availability, public.reviews to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant select on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant execute on function public.has_role(uuid, public.app_role) to anon, authenticated, service_role;
grant execute on function public.list_booking_slots() to anon, authenticated, service_role;
grant execute on function public.list_open_slots() to anon, authenticated, service_role;
grant execute on function public.consume_form_attempt(text) to service_role;
grant execute on function public.open_availability_range(jsonb) to authenticated, service_role;

insert into public.business_settings(id, config) values ('main', '{}'::jsonb)
on conflict (id) do nothing;

-- Restore administrator access for the existing TClean account in the replacement Auth project.
insert into public.user_roles(user_id, role)
values ('48cddab7-8a89-4184-b5a2-e053b41438aa', 'admin')
on conflict (user_id, role) do nothing;

insert into storage.buckets (id, name, public)
values
  ('site-images', 'site-images', true),
  ('quote-photos', 'quote-photos', false),
  ('client-media', 'client-media', false)
on conflict (id) do nothing;

create policy "Public read site images" on storage.objects
  for select to anon, authenticated using (bucket_id = 'site-images');
create policy "Admins upload site images" on storage.objects
  for insert to authenticated with check (bucket_id = 'site-images' and public.has_role(auth.uid(), 'admin'));
create policy "Admins update site images" on storage.objects
  for update to authenticated using (bucket_id = 'site-images' and public.has_role(auth.uid(), 'admin')) with check (bucket_id = 'site-images' and public.has_role(auth.uid(), 'admin'));
create policy "Admins delete site images" on storage.objects
  for delete to authenticated using (bucket_id = 'site-images' and public.has_role(auth.uid(), 'admin'));
