-- Reapuntar FKs user_id de auth.users → app_users porque Wall usa auth custom
-- (bcrypt + JWT jose + cookie sore_session) y no Supabase Auth nativo.

alter table public.alerts             drop constraint alerts_user_id_fkey;
alter table public.backtest_runs      drop constraint backtest_runs_user_id_fkey;
alter table public.diario_entries     drop constraint diario_entries_user_id_fkey;
alter table public.portfolios         drop constraint portfolios_user_id_fkey;
alter table public.prospectiva_theses drop constraint prospectiva_theses_user_id_fkey;
alter table public.track_record       drop constraint track_record_user_id_fkey;
alter table public.users_profile      drop constraint users_profile_user_id_fkey;
alter table public.watchlist          drop constraint watchlist_user_id_fkey;

alter table public.alerts             add constraint alerts_user_id_fkey             foreign key (user_id) references public.app_users(id) on delete cascade;
alter table public.backtest_runs      add constraint backtest_runs_user_id_fkey      foreign key (user_id) references public.app_users(id) on delete cascade;
alter table public.diario_entries     add constraint diario_entries_user_id_fkey     foreign key (user_id) references public.app_users(id) on delete cascade;
alter table public.portfolios         add constraint portfolios_user_id_fkey         foreign key (user_id) references public.app_users(id) on delete cascade;
alter table public.prospectiva_theses add constraint prospectiva_theses_user_id_fkey foreign key (user_id) references public.app_users(id) on delete cascade;
alter table public.track_record       add constraint track_record_user_id_fkey       foreign key (user_id) references public.app_users(id) on delete cascade;
alter table public.users_profile      add constraint users_profile_user_id_fkey      foreign key (user_id) references public.app_users(id) on delete cascade;
alter table public.watchlist          add constraint watchlist_user_id_fkey          foreign key (user_id) references public.app_users(id) on delete cascade;
