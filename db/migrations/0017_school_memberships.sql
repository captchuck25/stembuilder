-- Teacher ↔ school memberships (many-to-many).
--
-- Schools are an OPTIONAL organizational layer inside a district: a
-- single-school district can ignore them entirely. When used, a teacher can
-- belong to ANY number of schools (itinerant STEM teachers commonly serve
-- several buildings). profiles.school_id remains as the teacher's PRIMARY
-- school (what new classes stamp); the app keeps it in sync with the first
-- membership.
--
-- Run this once in the Supabase SQL editor (project: stembuilder), after 0016.

create table if not exists school_memberships (
  id         bigint generated always as identity primary key,
  user_id    text not null references profiles(id) on delete cascade,
  school_id  uuid not null references schools(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, school_id)
);
create index if not exists idx_school_memberships_school on school_memberships (school_id);
create index if not exists idx_school_memberships_user   on school_memberships (user_id);

-- Backfill: every existing single-school assignment becomes a membership.
insert into school_memberships (user_id, school_id)
select p.id, p.school_id
  from profiles p
  join schools s on s.id = p.school_id and s.deleted_at is null
 where p.school_id is not null
   and p.deleted_at is null
on conflict (user_id, school_id) do nothing;

-- RLS: tenant-scoped through the school's district. Both admin tiers manage
-- memberships for their scope; the membership's user must be in scope too.
alter table school_memberships enable row level security;
revoke all on school_memberships from anon;
grant select, insert, delete on school_memberships to authenticated;

drop policy if exists school_memberships_platform on school_memberships;
create policy school_memberships_platform on school_memberships for all to authenticated
  using (app_role() = 'admin') with check (app_role() = 'admin');

drop policy if exists school_memberships_own_district on school_memberships;
create policy school_memberships_own_district on school_memberships for all to authenticated
  using (app_role() = 'district_admin' and exists (
           select 1 from schools s
            where s.id = school_memberships.school_id
              and s.district_id = app_district_id()))
  with check (app_role() = 'district_admin'
    and exists (select 1 from schools s
                 where s.id = school_memberships.school_id
                   and s.district_id = app_district_id())
    and exists (select 1 from profiles p
                 where p.id = school_memberships.user_id
                   and p.district_id = app_district_id()));
