-- =====================================================================
--  COLBERT EN LUTTE — schéma base de données (Supabase / PostgreSQL)
--  À exécuter une seule fois dans : Supabase > SQL Editor > New query
--  Ré-exécutable sans casse (idempotent autant que possible).
-- =====================================================================

-- ---------- TABLES ----------------------------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  pseudo       text not null check (pseudo ~ '^[A-Za-z0-9_.-]{3,20}$'),
  pseudo_slug  text not null unique,
  role         text not null default 'membre' check (role in ('admin','modo','referent','membre')),
  referent_site text check (referent_site in ('colbert','ibd')),
  status       text not null default 'active' check (status in ('active','pending','banned')),
  color        text not null default '#ff4d2e',
  created_at   timestamptz not null default now(),
  last_seen    timestamptz
);

-- Identités réelles : lisibles UNIQUEMENT par l'admin.
create table if not exists public.identities (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  prenom     text,
  nom        text,
  consent_at timestamptz not null default now()
);

create table if not exists public.settings (
  id   int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb
);

create table if not exists public.site_status (
  site       text primary key check (site in ('colbert','ibd')),
  status     text not null default 'ouvert',
  note       text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.reports (
  id         bigint generated always as identity primary key,
  site       text not null check (site in ('colbert','ibd')),
  kind       text not null,
  note       text check (char_length(note) <= 280),
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  validated  boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.shifts (
  id         bigint generated always as identity primary key,
  site       text not null check (site in ('colbert','ibd')),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  note       text check (char_length(note) <= 140),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '24 hours')
);
create index if not exists shifts_time_idx on public.shifts (starts_at, ends_at);

create table if not exists public.checkins (
  user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  site    text not null check (site in ('colbert','ibd')),
  since   timestamptz not null default now()
);

create table if not exists public.channels (
  id          bigint generated always as identity primary key,
  slug        text not null unique,
  name        text not null,
  description text,
  admin_only  boolean not null default false,
  position    int not null default 0
);

create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  channel_id bigint not null references public.channels(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  content    text not null check (char_length(content) between 1 and 2000),
  pinned     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists messages_channel_idx on public.messages (channel_id, created_at desc);

create table if not exists public.polls (
  id         bigint generated always as identity primary key,
  question   text not null check (char_length(question) <= 300),
  options    jsonb not null,
  multiple   boolean not null default false,
  closes_at  timestamptz,
  closed     boolean not null default false,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.poll_votes (
  poll_id    bigint not null references public.polls(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  choices    int[] not null,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

create table if not exists public.pages (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('revendication','argument','droits','faq')),
  title      text not null,
  body       text not null default '',
  position   int not null default 0,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supports (
  page_id bigint not null references public.pages(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  primary key (page_id, user_id)
);

create table if not exists public.announcements (
  id         bigint generated always as identity primary key,
  title      text not null,
  body       text,
  level      text not null default 'info' check (level in ('info','urgent')),
  pinned     boolean not null default true,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.materials (
  id         bigint generated always as identity primary key,
  item       text not null,
  site       text not null default 'both' check (site in ('colbert','ibd','both')),
  qty_needed int not null default 1 check (qty_needed > 0),
  done       boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.pledges (
  material_id bigint not null references public.materials(id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  qty         int not null check (qty > 0),
  primary key (material_id, user_id)
);

create table if not exists public.events (
  id          bigint generated always as identity primary key,
  title       text not null,
  site        text check (site in ('colbert','ibd','autre')),
  place       text,
  starts_at   timestamptz not null,
  description text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  actor      uuid default auth.uid(),
  action     text not null,
  target     text,
  details    jsonb,
  created_at timestamptz not null default now()
);

-- ---------- FONCTIONS D'AUTORISATION ---------------------------------

create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active');
$$;

create or replace function public.is_mod() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active' and role in ('admin','modo'));
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active' and role = 'admin');
$$;

create or replace function public.can_site(s text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_mod() or exists (
    select 1 from profiles where id = auth.uid() and status = 'active'
      and role = 'referent' and (referent_site = s or s = 'both'));
$$;

-- ---------- INSCRIPTION AUTOMATIQUE ----------------------------------

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pseudo text := new.raw_user_meta_data->>'pseudo';
  v_role   text := 'membre';
  v_status text := 'active';
  v_manual boolean := false;
begin
  if coalesce(new.raw_user_meta_data->>'consent','') <> 'true' then
    raise exception 'Consentement requis';
  end if;
  if v_pseudo is null then v_pseudo := split_part(new.email, '@', 1); end if;

  if not exists (select 1 from profiles where role = 'admin') then
    v_role := 'admin';          -- le tout premier compte devient admin
  else
    select coalesce((data->>'manual_validation')::boolean, false) into v_manual from settings where id = 1;
    if v_manual then v_status := 'pending'; end if;
  end if;

  insert into profiles (id, pseudo, pseudo_slug, role, status, color)
  values (new.id, v_pseudo, lower(v_pseudo), v_role, v_status,
          coalesce(new.raw_user_meta_data->>'color', '#ff4d2e'));

  insert into identities (user_id, prenom, nom)
  values (new.id, left(new.raw_user_meta_data->>'prenom', 60), left(new.raw_user_meta_data->>'nom', 60));

  -- On efface prénom/nom des métadonnées techniques : ils ne restent que dans "identities".
  update auth.users
     set raw_user_meta_data = raw_user_meta_data - 'prenom' - 'nom'
   where id = new.id;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- RPC (actions sécurisées) ---------------------------------

create or replace function public.pseudo_available(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from profiles where pseudo_slug = lower(p));
$$;
grant execute on function public.pseudo_available(text) to anon, authenticated;

create or replace function public.touch() returns void
language sql security definer set search_path = public as $$
  update profiles set last_seen = now() where id = auth.uid();
$$;

create or replace function public.set_color(c text) returns void
language sql security definer set search_path = public as $$
  update profiles set color = c where id = auth.uid() and c ~ '^#[0-9a-fA-F]{6}$';
$$;

create or replace function public.set_role(uid uuid, new_role text, site text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé à l''admin'; end if;
  if uid = auth.uid() and new_role <> 'admin' then raise exception 'Tu ne peux pas te retirer le rôle admin'; end if;
  update profiles set role = new_role,
         referent_site = case when new_role = 'referent' then site else null end
   where id = uid;
  insert into audit_log (action, target, details) values ('role', uid::text, jsonb_build_object('role', new_role, 'site', site));
end $$;

create or replace function public.set_status(uid uuid, new_status text) returns void
language plpgsql security definer set search_path = public as $$
declare target_role text;
begin
  select role into target_role from profiles where id = uid;
  if not public.is_mod() then raise exception 'Réservé à la modération'; end if;
  if uid = auth.uid() then raise exception 'Action impossible sur ton propre compte'; end if;
  if target_role in ('admin','modo') and not public.is_admin() then raise exception 'Seul l''admin peut agir sur un modo'; end if;
  update profiles set status = new_status where id = uid;
  if new_status = 'banned' then delete from checkins where user_id = uid; end if;
  insert into audit_log (action, target, details) values ('status', uid::text, jsonb_build_object('status', new_status));
end $$;

create or replace function public.poll_counts() returns table (poll_id bigint, choice int, n bigint)
language sql stable security definer set search_path = public as $$
  select v.poll_id, c.choice, count(*) from poll_votes v, unnest(v.choices) as c(choice)
   where public.is_active() group by v.poll_id, c.choice
  union all
  select poll_id, -1, count(*) from poll_votes where public.is_active() group by poll_id;
$$;

create or replace function public.support_counts() returns table (page_id bigint, n bigint)
language sql stable security definer set search_path = public as $$
  select page_id, count(*) from supports where public.is_active() group by page_id;
$$;

create or replace function public.purge_identities() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé à l''admin'; end if;
  update identities set prenom = null, nom = null;
  insert into audit_log (action, target) values ('purge_identities', 'all');
end $$;

-- ---------- RLS --------------------------------------------------------

alter table public.profiles      enable row level security;
alter table public.identities    enable row level security;
alter table public.settings      enable row level security;
alter table public.site_status   enable row level security;
alter table public.reports       enable row level security;
alter table public.shifts        enable row level security;
alter table public.checkins      enable row level security;
alter table public.channels      enable row level security;
alter table public.messages      enable row level security;
alter table public.polls         enable row level security;
alter table public.poll_votes    enable row level security;
alter table public.pages         enable row level security;
alter table public.supports      enable row level security;
alter table public.announcements enable row level security;
alter table public.materials     enable row level security;
alter table public.pledges       enable row level security;
alter table public.events        enable row level security;
alter table public.audit_log     enable row level security;

do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- profils : lisibles par les membres actifs (+ soi-même). Modifs via RPC uniquement.
create policy p_profiles_read on public.profiles for select using (public.is_active() or id = auth.uid());

-- identités : admin seulement
create policy p_ident_read on public.identities for select using (public.is_admin());
create policy p_ident_del  on public.identities for delete using (public.is_admin());

-- réglages
create policy p_settings_read  on public.settings for select using (auth.uid() is not null);
create policy p_settings_write on public.settings for update using (public.is_admin()) with check (public.is_admin());

-- statut officiel des lieux
create policy p_status_read on public.site_status for select using (public.is_active());
create policy p_status_upd  on public.site_status for update using (public.can_site(site)) with check (public.can_site(site));
create policy p_status_ins  on public.site_status for insert with check (public.can_site(site));

-- signalements
create policy p_rep_read on public.reports for select using (public.is_active());
create policy p_rep_ins  on public.reports for insert with check (public.is_active() and user_id = auth.uid());
create policy p_rep_upd  on public.reports for update using (public.can_site(site));
create policy p_rep_del  on public.reports for delete using (user_id = auth.uid() or public.can_site(site));

-- créneaux
create policy p_shift_read on public.shifts for select using (public.is_active());
create policy p_shift_ins  on public.shifts for insert with check (public.is_active() and (user_id = auth.uid() or public.can_site(site)));
create policy p_shift_upd  on public.shifts for update using (user_id = auth.uid() or public.can_site(site)) with check (public.is_active());
create policy p_shift_del  on public.shifts for delete using (user_id = auth.uid() or public.can_site(site));

-- présence sur place
create policy p_chk_read on public.checkins for select using (public.is_active());
create policy p_chk_ins  on public.checkins for insert with check (public.is_active() and user_id = auth.uid());
create policy p_chk_upd  on public.checkins for update using (user_id = auth.uid());
create policy p_chk_del  on public.checkins for delete using (user_id = auth.uid() or public.is_mod());

-- salons
create policy p_chan_read  on public.channels for select using (public.is_active());
create policy p_chan_write on public.channels for all using (public.is_mod()) with check (public.is_mod());

-- messages
create policy p_msg_read on public.messages for select using (public.is_active());
create policy p_msg_ins  on public.messages for insert with check (
  public.is_active() and user_id = auth.uid()
  and (public.is_mod() or not exists (select 1 from channels c where c.id = channel_id and c.admin_only)));
create policy p_msg_upd  on public.messages for update using (public.is_mod());
create policy p_msg_del  on public.messages for delete using (user_id = auth.uid() or public.is_mod());

-- sondages
create policy p_poll_read on public.polls for select using (public.is_active());
create policy p_poll_ins  on public.polls for insert with check (
  public.is_mod() or (public.is_active() and coalesce((select (data->>'member_polls')::boolean from settings where id = 1), false)));
create policy p_poll_upd  on public.polls for update using (public.is_mod() or created_by = auth.uid());
create policy p_poll_del  on public.polls for delete using (public.is_mod() or created_by = auth.uid());

create policy p_vote_read on public.poll_votes for select using (user_id = auth.uid());
create policy p_vote_ins  on public.poll_votes for insert with check (
  public.is_active() and user_id = auth.uid()
  and exists (select 1 from polls p where p.id = poll_id and not p.closed and (p.closes_at is null or p.closes_at > now())));
create policy p_vote_del  on public.poll_votes for delete using (user_id = auth.uid());

-- pages d'info / revendications
create policy p_page_read  on public.pages for select using (public.is_active());
create policy p_page_write on public.pages for all using (public.is_mod()) with check (public.is_mod());

create policy p_sup_read on public.supports for select using (user_id = auth.uid());
create policy p_sup_ins  on public.supports for insert with check (public.is_active() and user_id = auth.uid());
create policy p_sup_del  on public.supports for delete using (user_id = auth.uid());

-- annonces
create policy p_ann_read  on public.announcements for select using (public.is_active());
create policy p_ann_write on public.announcements for all using (public.is_mod()) with check (public.is_mod());

-- matériel
create policy p_mat_read  on public.materials for select using (public.is_active());
create policy p_mat_write on public.materials for all using (public.can_site(site)) with check (public.can_site(site));
create policy p_pl_read on public.pledges for select using (public.is_active());
create policy p_pl_ins  on public.pledges for insert with check (public.is_active() and user_id = auth.uid());
create policy p_pl_upd  on public.pledges for update using (user_id = auth.uid());
create policy p_pl_del  on public.pledges for delete using (user_id = auth.uid() or public.is_mod());

-- agenda
create policy p_ev_read  on public.events for select using (public.is_active());
create policy p_ev_write on public.events for all using (public.is_mod()) with check (public.is_mod());

-- journal de modération
create policy p_audit_read on public.audit_log for select using (public.is_admin());
create policy p_audit_ins  on public.audit_log for insert with check (public.is_active() and actor = auth.uid());

-- ---------- TEMPS RÉEL -------------------------------------------------

do $$ declare t text; begin
  foreach t in array array['profiles','site_status','reports','shifts','checkins','channels','messages',
                           'polls','poll_votes','pages','announcements','materials','pledges','events','settings'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;

-- ---------- DONNÉES INITIALES -----------------------------------------

insert into public.settings (id, data) values (1, '{
  "name": "Colbert en lutte",
  "tagline": "On s''organise. On tient. On gagne.",
  "manual_validation": false,
  "member_polls": false,
  "slow_mode": 0,
  "day_start": 6,
  "day_end": 22,
  "purge_date": null,
  "sites": {
    "colbert": {"name": "Faculté Colbert", "short": "Colbert", "address": "14 rue Puvis de Chavannes, 13001", "lat": 43.30030, "lng": 5.37470, "min": 7, "target": 15},
    "ibd":     {"name": "Îlot Bernard du Bois", "short": "Bernard du Bois", "address": "5-9 bd Maurice Bourdet, 13001", "lat": 43.30215, "lng": 5.37925, "min": 5, "target": 10}
  }
}'::jsonb) on conflict (id) do nothing;

insert into public.site_status (site, status) values ('colbert','ouvert'), ('ibd','ouvert') on conflict do nothing;

insert into public.channels (slug, name, description, admin_only, position) values
  ('annonces', 'Annonces', 'Infos officielles (admin et modos seulement)', true, 0),
  ('general', 'Général', 'Discussion générale', false, 1),
  ('colbert', 'Colbert', 'Coordination du site Colbert', false, 2),
  ('ibd', 'Bernard du Bois', 'Coordination de l''îlot Bernard du Bois', false, 3),
  ('logistique', 'Logistique', 'Matériel, bouffe, transport', false, 4),
  ('ag-votes', 'AG & votes', 'Préparation des AG, propositions', false, 5)
on conflict (slug) do nothing;

insert into public.pages (kind, title, body, position)
select * from (values
  ('revendication', 'Revendication n°1 — [titre à compléter]', E'## Le constat\n[Décris le problème en 2-3 phrases.]\n\n## Ce qu''on demande\n- [Demande précise et mesurable]\n\n## Pourquoi c''est juste\n[Arguments, chiffres, sources.]', 1),
  ('revendication', 'Revendication n°2 — [titre à compléter]', E'## Le constat\n[...]\n\n## Ce qu''on demande\n- [...]\n\n## Pourquoi c''est juste\n[...]', 2),
  ('argument', 'Pourquoi on se mobilise', E'## En une phrase\n[Le message principal, simple et clair.]\n\n## Les 3 raisons principales\n- [Raison 1]\n- [Raison 2]\n- [Raison 3]', 1),
  ('argument', 'Réponses aux objections', E'## « Le blocage pénalise les étudiants »\n[Réponse]\n\n## « Ça ne sert à rien »\n[Réponse]\n\n## « Je vais rater mes partiels »\n[Réponse]', 2),
  ('argument', 'Chiffres clés & sources', E'## Chiffres\n- [Chiffre] — source : [lien]\n- [Chiffre] — source : [lien]', 3),
  ('droits', 'Tes droits (à faire valider par l''équipe juridique)', E'## Avant d''y aller\n- [Conseils pratiques]\n\n## Face aux forces de l''ordre\n- [À compléter avec l''équipe juridique]\n\n## En cas d''interpellation\n- [À compléter avec l''équipe juridique]', 1),
  ('droits', 'Contacts utiles', E'## Équipe juridique / legal team\n- [Nom / numéro]\n\n## Référents de site\n- Colbert : [pseudo]\n- Bernard du Bois : [pseudo]\n\n## Urgences\n- SAMU : 15 · Urgences : 112', 2),
  ('faq', 'Comment participer ?', E'1. Inscris-toi sur un créneau dans **Planning**.\n2. Le jour J, clique sur **Je suis sur place** en arrivant.\n3. Suis le salon de ton site dans le **Chat**.', 1)
) as v(kind, title, body, position)
where not exists (select 1 from public.pages);
