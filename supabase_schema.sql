-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- Location enum
create type location_type as enum (
  '가천대역_1번출구',
  '가천대학교_정문',
  '교육대학원',
  '제3기숙사',
  '제2기숙사',
  'AI공학관',
  '중앙도서관'
);

-- Users table
create table public.users (
  id uuid references auth.users on delete cascade primary key,
  email varchar(255) unique not null,
  name varchar(100) not null,
  phone varchar(20) not null,
  phone_verified_at timestamp with time zone,
  phone_mfa_factor_id uuid,
  nickname varchar(50) unique not null,
  nickname_updated_at timestamp with time zone,
  department varchar(100) not null,
  status varchar(20) default 'active' check (status in ('active', 'suspended')),
  is_admin boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Payout accounts table
create table public.user_payout_accounts (
  user_id uuid references public.users(id) on delete cascade primary key,
  bank_name varchar(50) not null,
  account_number varchar(80) not null,
  account_holder varchar(100) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Chat rooms table
create table public.chat_rooms (
  id uuid default uuid_generate_v4() primary key,
  title varchar(200) not null,
  from_location location_type not null,
  to_location location_type not null,
  departure_date date not null,
  departure_time time not null,
  max_participants integer default 4 check (max_participants >= 2 and max_participants <= 4),
  created_by uuid references public.users(id) on delete cascade not null,
  status varchar(20) default 'active' check (status in ('active', 'closed')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Room participants table
create table public.room_participants (
  id uuid default uuid_generate_v4() primary key,
  room_id uuid references public.chat_rooms(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  confirmed boolean default false,
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(room_id, user_id)
);

-- Messages table
create table public.messages (
  id uuid default uuid_generate_v4() primary key,
  room_id uuid references public.chat_rooms(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Reports table
create table public.reports (
  id uuid default uuid_generate_v4() primary key,
  room_id uuid references public.chat_rooms(id) on delete set null,
  reporter_id uuid references public.users(id) on delete cascade not null,
  reported_id uuid references public.users(id) on delete cascade not null,
  reason text not null,
  status varchar(20) default 'pending' check (status in ('pending', 'reviewed', 'resolved')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Favorites table
create table public.favorites (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  from_location location_type not null,
  to_location location_type not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, from_location, to_location)
);

-- Enable RLS (Row Level Security)
alter table public.users enable row level security;
alter table public.user_payout_accounts enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.room_participants enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;
alter table public.favorites enable row level security;

-- Explicit Data API grants
grant usage on schema public to authenticated;
grant usage on type public.location_type to authenticated;

grant select, insert, update on table public.users to authenticated;
grant select, insert, update on table public.user_payout_accounts to authenticated;
grant select, insert, update, delete on table public.chat_rooms to authenticated;
grant select, insert, update, delete on table public.room_participants to authenticated;
grant select, insert on table public.messages to authenticated;
grant select, insert, update on table public.reports to authenticated;
grant select, insert, delete on table public.favorites to authenticated;

-- RLS Policies
-- Users: Users can read all users but only update themselves
create policy "Users can read all users" on public.users for select using (true);
create policy "Users can update own profile" on public.users for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.users for insert with check (auth.uid() = id);

-- Payout accounts: owners can manage their own account, room participants can read creator payout accounts
create policy "Users can manage own payout account"
  on public.user_payout_accounts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Room participants can read creator payout accounts"
  on public.user_payout_accounts
  for select
  using (
    exists (
      select 1
      from public.chat_rooms
      join public.room_participants
        on room_participants.room_id = chat_rooms.id
      where chat_rooms.created_by = user_payout_accounts.user_id
        and room_participants.user_id = auth.uid()
    )
  );

-- Chat rooms: Everyone can read, authenticated users can create
create policy "Anyone can read chat rooms" on public.chat_rooms for select using (true);
create policy "Authenticated users can create chat rooms" on public.chat_rooms for insert with check (auth.uid() = created_by);
create policy "Room creators can transfer active rooms to participants"
  on public.chat_rooms for update
  using (auth.uid() = created_by)
  with check (
    auth.uid() = created_by
    or exists (
      select 1
      from public.room_participants
      where room_participants.room_id = chat_rooms.id
        and room_participants.user_id = chat_rooms.created_by
    )
  );
create policy "Authenticated users can lock active rooms for capacity checks"
  on public.chat_rooms
  for update
  to authenticated
  using (status = 'active')
  with check (false);
create policy "Room creators can delete their rooms" on public.chat_rooms for delete using (auth.uid() = created_by);

-- Room participants: Everyone can read, users can join/leave
create policy "Anyone can read participants" on public.room_participants for select using (true);
create policy "Users can join rooms" on public.room_participants for insert with check (auth.uid() = user_id);
create policy "Users can leave rooms" on public.room_participants for delete using (auth.uid() = user_id);
create policy "Users can update their participation" on public.room_participants for update using (auth.uid() = user_id);

-- Messages: Room participants can read/send messages
create policy "Room participants can read messages" on public.messages 
  for select using (
    exists (
      select 1 from public.room_participants 
      where room_id = messages.room_id and user_id = auth.uid()
    )
  );
create policy "Room participants can send messages" on public.messages 
  for insert with check (
    auth.uid() = user_id and 
    exists (
      select 1 from public.room_participants 
      where room_id = messages.room_id and user_id = auth.uid()
    )
  );

-- Reports: Users can create reports, admins can read all
create policy "Users can create reports" on public.reports for insert with check (auth.uid() = reporter_id);
create policy "Admins can read all reports" on public.reports for select using (
  exists (
    select 1 from public.users 
    where id = auth.uid() and is_admin = true
  )
);
create policy "Admins can update reports" on public.reports for update using (
  exists (
    select 1 from public.users
    where id = auth.uid() and is_admin = true
  )
);

-- Favorites: Users can manage their own favorites
create policy "Users can manage own favorites" on public.favorites for all using (auth.uid() = user_id);

-- Functions and triggers for updated_at
create or replace function public.handle_updated_at()
returns trigger
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

revoke all on function public.handle_updated_at() from public, anon, authenticated;

create trigger handle_updated_at before update on public.users
  for each row execute procedure public.handle_updated_at();

create trigger handle_updated_at before update on public.user_payout_accounts
  for each row execute procedure public.handle_updated_at();

-- Guard room capacity at the database level.
create or replace function public.enforce_room_capacity()
returns trigger
set search_path = ''
as $$
declare
  current_count integer;
  max_count integer;
  room_status text;
begin
  select chat_rooms.max_participants, chat_rooms.status
    into max_count, room_status
    from public.chat_rooms
    where chat_rooms.id = new.room_id
    for update;

  if max_count is null then
    raise exception 'chat room not found';
  end if;

  if room_status <> 'active' then
    raise exception 'chat room is not active';
  end if;

  select count(*)
    into current_count
    from public.room_participants
    where room_participants.room_id = new.room_id;

  if current_count >= max_count then
    raise exception 'chat room is full';
  end if;

  return new;
end;
$$ language plpgsql;

revoke all on function public.enforce_room_capacity() from public, anon, authenticated;

create trigger enforce_room_capacity_before_insert
  before insert on public.room_participants
  for each row execute procedure public.enforce_room_capacity();

-- Query indexes for the main mobile flows
create index chat_rooms_route_date_status_time_idx
  on public.chat_rooms (from_location, to_location, departure_date, status, departure_time);

create index chat_rooms_created_by_idx on public.chat_rooms (created_by);
create index room_participants_room_id_idx on public.room_participants (room_id);
create index room_participants_user_id_idx on public.room_participants (user_id);
create index messages_room_id_created_at_idx on public.messages (room_id, created_at);
create index reports_reporter_id_idx on public.reports (reporter_id);
create index reports_reported_id_idx on public.reports (reported_id);
create index reports_status_idx on public.reports (status);
create index favorites_user_id_idx on public.favorites (user_id);

-- Supabase Realtime publication for live chat and participant membership updates
alter table public.messages replica identity full;
alter table public.room_participants replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'room_participants'
  ) then
    alter publication supabase_realtime add table public.room_participants;
  end if;
end $$;

-- Sample data for testing (optional)
-- You can insert some test data here if needed
