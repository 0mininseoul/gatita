alter table public.user_private_profiles
  add column if not exists pwa_installed boolean not null default false;

comment on column public.user_private_profiles.pwa_installed
  is 'Whether the user has installed the app as a PWA.';
