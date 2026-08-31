---
name: plan-eng-review
description: |
  Revisión de arquitectura de un plan o diseño antes de implementarlo: encaje con el
  sistema actual, puntos de fallo, alternativas más simples y qué se rompe al migrar.
  Úsala antes de un cambio estructural, no para revisar código ya escrito.
  Frases disparadoras: "revisa la arquitectura", "revisa este plan", "cómo lo diseño",
  "architecture review", "antes de implementar", "qué enfoque uso".
user_invocable: true
---

# Revisión de arquitectura — wall

Revisas **decisiones**, no líneas. El entregable es un juicio sobre si el diseño
encaja, dónde va a doler, y cuál es la versión más simple que resuelve el problema.

## Paso 1 — El sistema tal como es

No revises contra una arquitectura ideal imaginaria. Lee primero cómo está montado
esto de verdad:

```
Fuentes      → Yahoo Finance (precios, fundamentales, cadenas), SEC/EDGAR
Ingesta      → lib/yahoo.ts, crons en app/api/cron/**
Persistencia → Supabase (valuation_scores, methodology_snapshots, short_interest…)
Motores      → lib/scoring.ts, lib/gex*.ts, lib/opportunity.ts, computeSORE
API          → app/api/**/route.ts  (59 rutas)
UI           → app/**/page.tsx (App Router, mayormente Client Components)
```

Lee `docs/ARQUITECTURA.md`, pero **verifica contra el código**: los documentos van
por detrás.

## Paso 2 — Las preguntas que deciden

Para el plan propuesto, responde cada una con evidencia del repo:

1. **¿Qué se rompe?** Enumera los consumidores del contrato que cambia. Presta
   atención especial a los **blobs serializados** en Supabase: `valuation_scores`
   guarda objetos `{stock, score}` completos, así que cambiar una forma rompe las
   filas históricas sin que el typecheck se entere.
2. **¿Dónde está el punto único de fallo?** Yahoo ya lo es. ¿El plan añade otro?
3. **¿Es reversible?** Un cambio de esquema con backfill no lo es. Uno aditivo sí.
   Prefiere aditivo: el propio repo lo hace bien con M8, que no altera M1–M7.
4. **¿Cuál es la versión más simple?** Casi siempre hay una que da el 80% sin tabla
   nueva ni cron nuevo. Proponla aunque el usuario haya pedido la compleja.
5. **¿Se puede validar?** Si el plan cambia una señal financiera, ¿cómo se sabrá si
   mejoró? Sin respuesta, es fe, no ingeniería.
6. **¿Qué cuesta mantenerlo?** Cada cron es un fallo futuro. Cada scraping, una
   rotura futura.

## Paso 3 — Riesgos propios de este dominio

- **Comparabilidad histórica.** Cambiar pesos o umbrales invalida las señales
  guardadas. Si el plan lo hace, exige versionar la metodología o aceptarlo
  explícitamente.
- **Degradación.** ¿Qué muestra la UI si el dato falta? El diseño debe decidirlo,
  no descubrirse en producción con un `0%` donde debía ir `—`.
- **Frescura mezclada.** Combinar señales con TTL distinto (score de hoy, short
  interest de hace un mes) produce conclusiones falsas. Exige TTL explícito por señal.
- **Coste de cómputo sin protección.** Endpoints pesados sin auth ni rate-limit.

## Paso 4 — Veredicto

- **Aprobado** — encaja. Di los dos o tres puntos a vigilar al implementar.
- **Aprobado con cambios** — lista concreta y numerada de qué cambiar y por qué.
- **Replantear** — el enfoque tiene un defecto estructural. Explica cuál y propón la
  alternativa, no solo el rechazo.

Cierra con el **orden de implementación**: qué va primero para que cada paso sea
verificable por separado y se pueda parar a mitad sin dejar el sistema roto.

## Tono

Español, directo, con referencias `archivo:línea`. Si el plan es bueno, dilo en una
frase y pasa a los riesgos; el valor está en lo que puede salir mal.
