-- Motor de Oportunidades — registro de alertas disparadas.
--
-- La tabla `alerts` guarda las REGLAS de alerta del usuario, pero hasta ahora no
-- existía dónde registrar que una alerta se DISPARÓ. `alert_events` cierra ese hueco:
-- el cron diario evalúa las reglas + una regla global de "cruce a compra fuerte" e
-- inserta aquí cada disparo, que la app muestra como feed/badge in-app.

create table public.alert_events (
  id                uuid primary key default gen_random_uuid(),
  -- null = evento global (regla automática, visible para todos)
  user_id           uuid references public.app_users(id) on delete cascade,
  -- null = no proviene de una regla de usuario (ej. cruce automático)
  alert_id          uuid references public.alerts(id) on delete cascade,
  symbol_id         uuid references public.symbols(id) on delete set null,
  kind              text not null,           -- 'cruce_compra_fuerte' | 'alerta_usuario'
  message           text not null,
  opportunity_score integer,
  created_at        timestamptz not null default now(),
  read_at           timestamptz
);

comment on table public.alert_events is
  'Alertas disparadas por el cron de oportunidades. user_id null = evento global.';

create index alert_events_user_id_idx   on public.alert_events (user_id, created_at desc);
create index alert_events_alert_id_idx  on public.alert_events (alert_id, created_at desc);

alter table public.alert_events enable row level security;

revoke all on public.alert_events from anon, authenticated;
