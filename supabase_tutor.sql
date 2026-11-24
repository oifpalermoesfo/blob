create table if not exists public.orari_tutor (
  id integer primary key check (id = 1),
  dati jsonb not null default '[]'::jsonb,
  aggiornato_il timestamptz not null default now()
);

insert into public.orari_tutor (id, dati)
values (1, '[]'::jsonb)
on conflict (id) do nothing;

alter table public.orari_tutor enable row level security;

revoke all on table public.orari_tutor from anon;
grant select on table public.orari_tutor to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'orari_tutor'
      and policyname = 'utenti autenticati leggono orari tutor'
  ) then
    create policy "utenti autenticati leggono orari tutor"
      on public.orari_tutor for select to authenticated using (true);
  end if;
end $$;
