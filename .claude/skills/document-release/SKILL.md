---
name: document-release
description: |
  Actualiza la documentación después de shippear, para que los docs no mientan.
  Úsala tras desplegar un cambio, cerrar un PR, o cuando la documentación se haya
  quedado atrás respecto al código.
  Frases disparadoras: "actualiza los docs", "documenta el release", "documenta esto",
  "los docs están desactualizados", "después de shippear".
user_invocable: true
---

# Documentar un release — wall

La documentación desactualizada es peor que la ausente: se cree. El trabajo aquí es
tanto **borrar lo que dejó de ser cierto** como añadir lo nuevo.

## Paso 1 — Qué cambió de verdad

```bash
git log --oneline <ultimo-tag-o-fecha>..HEAD
git diff --stat <ref>..HEAD
```

Filtra: solo interesa lo que cambia el modelo mental de alguien que use o mantenga
el sistema. Un refactor interno sin efecto observable no se documenta.

Interesa especialmente:

- Endpoints nuevos, renombrados o eliminados
- Cambios de **esquema de BD** o migraciones aplicadas
- Cambios en **motores de decisión**: pesos, umbrales, fórmulas. Estos van siempre,
  porque invalidan la comparabilidad de señales históricas.
- Variables de entorno o crons nuevos
- Contratos de datos que otros módulos consumen

## Paso 2 — Dónde escribir

| Documento | Qué contiene |
|---|---|
| `docs/ARQUITECTURA.md` | Estructura, flujo de datos, decisiones de diseño |
| `docs/SUPABASE_SCHEMA.md` | Tablas, columnas, índices. Sincronizar con las migraciones |
| `docs/AUDITORIA_*.md` | Hallazgos de auditorías. Marcar los resueltos, no borrarlos |
| `AGENTS.md` / `CLAUDE.md` | Reglas para agentes. Solo si cambian las convenciones |
| `README` | Solo si cambia cómo se arranca o se despliega |

Regla: **un hecho, un sitio.** Si el mismo dato está en dos documentos, uno acabará
mintiendo. Deja el canónico y enlaza desde el otro.

## Paso 3 — Corregir lo que quedó falso

Esta es la parte que se salta y la que hace daño. Busca activamente:

```bash
grep -rn "<nombre-viejo>" docs/ *.md
```

- Rutas, funciones o tablas renombradas
- Números que ya no son ciertos (pesos, umbrales, conteos)
- Hallazgos de auditoría que ya se arreglaron y siguen listados como pendientes
- Pasos de instalación o comandos que ya no funcionan

**Verifica los comandos que documentes ejecutándolos.** Este repo no tiene Node en el
PATH: cualquier doc que diga `npm run build` es falso. Lo real es
`node .\node_modules\next\dist\bin\next build` con el PATH portable delante.

## Paso 4 — Verificar

- Los enlaces internos resuelven.
- Los ejemplos de código compilan o se corresponden con el código actual.
- Las tablas de esquema coinciden con las migraciones en `supabase/migrations/`.

## Informe

En español: qué documentos tocaste, qué añadiste, **qué corregiste porque era falso**
(sección aparte, es la más valiosa), y qué quedó sin documentar y por qué.
