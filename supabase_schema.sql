-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- Location enum
create type location_type as enum (
  '가천대역_1번출구',
  '가천대학교_정문',
  '교육대학원',
  'AI공학관'
);

-- Users table
create table public.users (
  id uuid references auth.users on delete cascade primary key,
  email varchar(255) unique not null,
  name varchar(100) not null,
  phone varchar(20) not null,
  nickname varchar(50) unique not null,
  nickname_updated_at timestamp with time zone,
  department varchar(100) not null,
  status varchar(20) default 'active' check (status in ('active', 'suspended')),
  is_admin boolean default false,
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
alter table public.chat_rooms enable row level security;
alter table public.room_participants enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;
alter table public.favorites enable row level security;

-- RLS Policies
-- Users: Users can read all users but only update themselves
create policy "Users can read all users" on public.users for select using (true);
create policy "Users can update own profile" on public.users for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.users for insert with check (auth.uid() = id);

-- Chat rooms: Everyone can read, authenticated users can create
create policy "Anyone can read chat rooms" on public.chat_rooms for select using (true);
create policy "Authenticated users can create chat rooms" on public.chat_rooms for insert with check (auth.uid() = created_by);
create policy "Room creators can update their rooms" on public.chat_rooms for update using (auth.uid() = created_by);

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

-- Favorites: Users can manage their own favorites
create policy "Users can manage own favorites" on public.favorites for all using (auth.uid() = user_id);

-- Functions and triggers for updated_at
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

create trigger handle_updated_at before update on public.users
  for each row execute procedure public.handle_updated_at();

-- Function to automatically create user profile after signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  return new;
end;
$$ language plpgsql security definer;

-- Sample data for testing (optional)
-- You can insert some test data here if needed