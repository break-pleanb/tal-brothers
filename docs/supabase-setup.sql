-- 탈: 이면의 형제들 — Supabase 초기 설정 (M3 계획 7.3의 사람 작업 6번)
--
-- Supabase 대시보드 → SQL Editor에 그대로 붙여 넣고 실행한다.
-- 여러 번 실행해도 안전하도록 모두 IF NOT EXISTS / DROP ... IF EXISTS를 쓴다.
--
-- 설계 근거
--   - 게임 상태의 원본은 서버 메모리다. 이 테이블들은 프로필과 초대 코드 조회·이력용이다 (아키텍처 §10)
--   - 쓰기는 서버(service role)만 한다. 클라이언트는 RLS로 본인 데이터 읽기만 할 수 있다
--   - 세이브(game_saves)는 M5다. 여기에 만들지 않는다

-- ─────────────────────────────────────────────────────────────
-- 1. profiles — 표시 이름과 아바타
-- ─────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id           uuid        primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 본인 프로필만 읽는다 (다른 형제의 정보는 서버가 투영해 보낸다, 룰북 §17)
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- 로그인하면 프로필 행을 자동으로 만든다. Google 로그인이므로 이름·아바타가 함께 들어온다
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- 2. rooms — 초대 코드 조회와 이력
-- ─────────────────────────────────────────────────────────────

create table if not exists public.rooms (
  code         text        primary key,
  host_user_id uuid        not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  closed_at    timestamptz
);

create index if not exists rooms_host_user_id_idx on public.rooms (host_user_id);

alter table public.rooms enable row level security;

-- 내가 만든 방만 읽는다. 참가자는 REST(GET /api/rooms/:code)로 서버에서 확인한다
drop policy if exists "rooms_select_own" on public.rooms;
create policy "rooms_select_own"
  on public.rooms for select
  using (auth.uid() = host_user_id);

-- 쓰기 정책은 두지 않는다. service role은 RLS를 지나지 않으므로 서버만 쓸 수 있다
