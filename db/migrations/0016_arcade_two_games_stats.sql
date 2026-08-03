-- 0016: Class Arcade v2 — two cabinets per student + difficulty stats.
--
--  * Students may now publish TWO games per class (their 2 favorites).
--    Uniqueness moves from (owner, class) to (owner, class, slot): publishing
--    the same save slot still replaces that game; a third distinct slot makes
--    the app prompt the student to retire one of the two first.
--  * attempts / wins count every finished try (win or lose) across the class,
--    so the arcade can show a difficulty / popularity signal per game.
--    Reset on republish (a changed level invalidates old stats, same as runs).

alter table arcade_games add column if not exists slot integer not null default 0;
alter table arcade_games add column if not exists attempts integer not null default 0;
alter table arcade_games add column if not exists wins integer not null default 0;

alter table arcade_games drop constraint if exists arcade_games_owner_id_class_id_key;
create unique index if not exists arcade_games_owner_class_slot_key
  on arcade_games (owner_id, class_id, slot);
