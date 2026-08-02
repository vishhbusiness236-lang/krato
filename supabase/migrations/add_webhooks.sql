create table webhooks (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  webhook_url text not null,
  platform text not null default 'slack',
  created_at timestamp with time zone default now()
);

alter table webhooks enable row level security;
create policy "Allow public insert" on webhooks for insert to anon with check (true);
create policy "Allow public read" on webhooks for select to anon using (true);
