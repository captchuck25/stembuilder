-- 0018: Teacher plan & student-cap system.
--
-- Individual teachers get a plan: 'free' (default, 50 students), 'pro'
-- (125 + 25 per purchased overage block), or 'pro_trial' (125 until
-- pro_trial_ends_at, then treated as free). Teachers with a district
-- (profiles.district_id set) inherit institutional access and are exempt.
--
-- Enforcement is a BEFORE trigger on enrollments — the single authoritative
-- gate every path funnels through: the create_student_account RPC, the
-- student join upsert, onboarding re-join, and roster imports. App routes
-- pre-check for friendly UX, but the trigger is what makes the cap
-- race-proof and impossible to bypass from any client.

alter table profiles
  add column if not exists plan text not null default 'free',
  add column if not exists pro_trial_started_at timestamptz,
  add column if not exists pro_trial_ends_at timestamptz,
  add column if not exists pro_overage_blocks integer not null default 0;

alter table profiles drop constraint if exists profiles_plan_check;
alter table profiles add constraint profiles_plan_check
  check (plan in ('free', 'pro', 'pro_trial'));

alter table profiles drop constraint if exists profiles_overage_blocks_check;
alter table profiles add constraint profiles_overage_blocks_check
  check (pro_overage_blocks >= 0);

create or replace function public.enforce_teacher_student_cap()
returns trigger
language plpgsql
as $$
declare
  v_teacher    text;
  v_plan       text;
  v_trial_ends timestamptz;
  v_district   uuid;
  v_blocks     integer;
  v_cap        integer;
  v_others     integer;
begin
  -- Only enforce when an enrollment is becoming ACTIVE.
  if new.deleted_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.deleted_at is null then
    return new; -- already active; nothing new to count
  end if;

  select c.teacher_id into v_teacher
    from classes c where c.id = new.class_id;
  if v_teacher is null then
    return new;
  end if;

  select p.plan, p.pro_trial_ends_at, p.district_id, p.pro_overage_blocks
    into v_plan, v_trial_ends, v_district, v_blocks
    from profiles p where p.id = v_teacher;
  if not found then
    return new;
  end if;

  -- Institutional (school/district) teachers are exempt from individual caps.
  if v_district is not null then
    return new;
  end if;

  -- An expired trial behaves as free.
  if v_plan = 'pro_trial' and (v_trial_ends is null or v_trial_ends < now()) then
    v_plan := 'free';
  end if;

  if v_plan = 'pro' then
    v_cap := 125 + 25 * coalesce(v_blocks, 0);
  elsif v_plan = 'pro_trial' then
    v_cap := 125;
  else
    v_cap := 50;
  end if;

  -- Distinct active students across the teacher's active classes, excluding
  -- the joining student (a student already enrolled elsewhere with this
  -- teacher adds no new seat and must not be blocked).
  select count(distinct e.student_id) into v_others
    from enrollments e
    join classes c on c.id = e.class_id
   where c.teacher_id = v_teacher
     and c.deleted_at is null
     and e.deleted_at is null
     and e.student_id <> new.student_id;

  if v_others >= v_cap then
    raise exception 'teacher_student_cap';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_teacher_student_cap on enrollments;
create trigger trg_enforce_teacher_student_cap
  before insert or update on enrollments
  for each row execute function public.enforce_teacher_student_cap();
