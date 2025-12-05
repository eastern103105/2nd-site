-- Function to increment active students
create or replace function public.increment_active_students(academy_id_param text)
returns void as $$
begin
  update public.academies
  set active_students = coalesce(active_students, 0) + 1
  where id = academy_id_param;
end;
$$ language plpgsql security definer;
