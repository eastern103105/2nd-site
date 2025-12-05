
-- Battles / Game Rooms Table
create table if not exists public.battles (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  password text,
  difficulty text default 'normal',
  selected_book text,
  host_id uuid references auth.users(id) on delete cascade,
  host_name text,
  status text default 'waiting', -- 'waiting', 'playing', 'finished'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  players jsonb not null default '{}'::jsonb, -- Store player objects: { "uuid": { name: "...", score: 0 ... } }
  player_count int default 1,
  max_players int default 2,
  game_type text default 'battle' -- 'battle', 'survival', 'wordrain'
);

-- Enable RLS
alter table public.battles enable row level security;

-- Policies
create policy "Battles are viewable by everyone" 
  on public.battles for select 
  using (true);

create policy "Authenticated users can create battles" 
  on public.battles for insert 
  with check (auth.role() = 'authenticated');

create policy "Users can update battles (join/leave/start)" 
  on public.battles for update 
  using (auth.role() = 'authenticated');

create policy "Hosts can delete their battles" 
  on public.battles for delete 
  using (auth.uid() = host_id);


-- Realtime subscription setup is done via Supabase Dashboard or client-side channel subscription.
-- Typically we just need the table to exist and have Replica Identity Full if we want full row updates, 
-- but Default is usually fine for inserts/updates.
-- alter publication supabase_realtime add table public.battles;
