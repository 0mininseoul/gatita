create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display_name text;
  parsed_name text;
  parsed_department text;
  parsed_avatar text;
begin
  -- 가천 계정만 처리
  if new.email is null or lower(new.email) not like '%@gachon.ac.kr' then
    return new;
  end if;

  display_name := coalesce(
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'display_name'
  );

  -- 앱 extractGachonProfileFromMetadata 로직 재현: "이름/학과" 형태
  parsed_name := nullif(trim(split_part(coalesce(display_name, ''), '/', 1)), '');
  parsed_department := nullif(trim(split_part(coalesce(display_name, ''), '/', 2)), '');
  parsed_avatar := coalesce(
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'picture'
  );

  insert into public.users (id, nickname, department, avatar_url)
  values (new.id, null, parsed_department, parsed_avatar)
  on conflict (id) do nothing;

  insert into public.user_private_profiles (user_id, email, name, status, is_admin, onboarded_at)
  values (new.id, new.email, parsed_name, 'active', false, null)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
