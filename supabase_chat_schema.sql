-- Chats Table
create table if not exists public.chats (
  id uuid default uuid_generate_v4() primary key,
  student_id uuid references public.users(id),
  student_name text,
  teacher_id uuid references public.users(id),
  teacher_name text,
  academy_id text references public.academies(id),
  last_message text,
  updated_at timestamptz default now(),
  unread_count jsonb default '{}'::jsonb
);

alter table public.chats enable row level security;

create policy "Users can view their own chats"
  on public.chats for select
  using (auth.uid() = student_id or auth.uid() = teacher_id);

create policy "Users can update their own chats"
  on public.chats for update
  using (auth.uid() = student_id or auth.uid() = teacher_id);

create policy "Users can insert chats"
  on public.chats for insert
  with check (auth.uid() = student_id or auth.uid() = teacher_id);


-- Messages Table
create table if not exists public.messages (
  id uuid default uuid_generate_v4() primary key,
  chat_id uuid references public.chats(id) on delete cascade,
  sender_id uuid references public.users(id),
  sender_name text,
  text text,
  created_at timestamptz default now()
);

alter table public.messages enable row level security;

create policy "Users can view messages in their chats"
  on public.messages for select
  using (
    exists (
      select 1 from public.chats
      where id = messages.chat_id
      and (student_id = auth.uid() or teacher_id = auth.uid())
    )
  );

create policy "Users can insert messages in their chats"
  on public.messages for insert
  with check (
    exists (
      select 1 from public.chats
      where id = messages.chat_id
      and (student_id = auth.uid() or teacher_id = auth.uid())
    )
  );

-- Function to update chat updated_at on new message
create or replace function public.handle_new_message()
returns trigger as $$
begin
  update public.chats
  set updated_at = new.created_at,
      last_message = new.text
  where id = new.chat_id;
  return new;
end;
$$ language plpgsql;

create trigger on_new_message
  after insert on public.messages
  for each row execute procedure public.handle_new_message();
