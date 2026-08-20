---
name: retro
description: |
  Retrospectiva del periodo: qué se hizo, qué se rompió, qué patrones se repiten y
  qué cambiar en la forma de trabajar. Úsala para la revisión semanal o al cerrar
  un ciclo de trabajo.
  Frases disparadoras: "retro", "retrospectiva", "resumen de la semana", "qué hicimos",
  "revisión semanal", "cómo fue el sprint".
user_invocable: true
---

# Retrospectiva — wall

Una retro útil cambia algo. Si termina en "todo bien, seguimos", no ha servido.

## Paso 1 — Los hechos del periodo

Por defecto, la última semana; ajusta si el usuario indica otro rango.

```bash
git log --since="7 days ago" --oneline
git log --since="7 days ago" --numstat --format="%h %s"
git shortlog --since="7 days ago" -sn
```

Extrae y cuantifica:

- Commits por tipo (`feat`, `fix`, `chore`, `docs`, `refactor`).
- **Ratio fix/feat.** Muchos `fix` sobre código reciente indica que se shippea sin
  verificar lo suficiente.
- Archivos más tocados. Un fichero que cambia cada semana suele tener un problema de
  diseño, no de mantenimiento.
- Reversiones y arreglos de arreglos.

## Paso 2 — Salud operativa

Este proyecto tiene infraestructura viva; míralo, no lo supongas:

- Tabla `cron_runs` en Supabase: ejecuciones con `status` `partial` o `failed`,
  duración creciente, errores recurrentes por ticker.
- Workflows de `.github/workflows/cron-*.yml`: ¿fallaron? ¿siguen alineados con los
  handlers de `app/api/cron/**`?
- Deuda declarada en `docs/AUDITORIA_*.md` y en memoria: ¿qué hallazgos siguen
  abiertos desde la última retro? Un pendiente que sobrevive tres retros ya no es un
  pendiente, es una decisión implícita de no hacerlo. Nómbralo como tal.

## Paso 3 — Patrones, no anécdotas

Un incidente es ruido; tres del mismo tipo son un patrón. Busca:

- ¿Los mismos bugs vuelven? (señal de arreglos sin test de regresión)
- ¿Se rompe siempre la misma capa? (Yahoo, caché, forma de blobs serializados)
- ¿Se descubre tarde? (falta de puertas o de monitorización)
- ¿Se empieza mucho y se cierra poco? (trabajo a medias acumulándose)

## Paso 4 — Salida

Corto y accionable, en español:

**Lo que funcionó** — 2-3 puntos, con el hecho que lo respalda. No genérico.

**Lo que costó** — 2-3 puntos, con el coste concreto (tiempo perdido, bug en
producción, señal errónea).

**Un cambio para el próximo periodo.** Uno solo, específico y verificable. "Mejorar
los tests" no vale; "añadir test de regresión en el mismo commit que cada fix" sí.

**Pendientes que siguen vivos**, con su edad en semanas. La edad es el dato que
obliga a decidir.

## Al terminar

Guarda en memoria los pendientes que sigan abiertos, con fecha absoluta, para que la
próxima retro pueda medir su antigüedad.
