alter table public.users
  add column if not exists phone_verified_at timestamp with time zone,
  add column if not exists phone_mfa_factor_id uuid;

create table if not exists public.user_payout_accounts (
  user_id uuid references public.users(id) on delete cascade primary key,
  bank_name varchar(50) not null,
  account_number varchar(80) not null,
  account_holder varchar(100) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.user_payout_accounts enable row level security;

grant select, insert, update on table public.user_payout_accounts to authenticated;

drop policy if exists "Users can manage own payout account" on public.user_payout_accounts;
drop policy if exists "Room participants can read creator payout accounts" on public.user_payout_accounts;

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

drop trigger if exists handle_updated_at on public.user_payout_accounts;
create trigger handle_updated_at before update on public.user_payout_accounts
  for each row execute procedure public.handle_updated_at();
