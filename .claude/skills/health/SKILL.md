---
name: health
description: |
  Chequeo de salud del código: deuda técnica cuantificada, cobertura real,
  dependencias, tamaño de módulos y puntos únicos de fallo. Úsala para saber cómo
  está el proyecto sin perseguir un bug concreto.
  Frases disparadoras: "salud del proyecto", "health check", "calidad del código",
  "deuda técnica", "cómo está el repo", "qué tan mal está esto".
user_invocable: true
---

# Health check — wall

Diagnóstico cuantitativo, no impresiones. Cada afirmación va con su número medido en
esta ejecución.

## Entorno

```powershell
$env:PATH = "C:\Users\daniel.montero\node\node-v22.14.0-win-x64;$env:PATH"
```

## Métricas a recoger

Ejecuta y anota el valor exacto. Las independientes, en paralelo.

1. **Typecheck** — `tsc --noEmit`. Cero o el número de errores.
2. **Lint agrupado por regla** — vuelca a JSON y cuenta:
   ```powershell
   node .\node_modules\eslint\bin\eslint.js . -f json -o eslint.json
   ```
   Separa ruido cosmético (`no-explicit-any`) de señales de bug real
   (`set-state-in-effect`, `exhaustive-deps`, `static-components`).
3. **Tests** — suites, tests, y la ratio contra superficie:
   `find app/api -name route.ts | wc -l` frente a los ficheros de `__tests__/`.
   Identifica qué **lógica de decisión financiera** no tiene ningún test: es la
   deuda que más caro sale.
4. **Módulos grandes** — los ficheros que concentran el riesgo:
   ```bash
   find app lib components -name '*.ts*' | xargs wc -l | sort -rn | head -20
   ```
5. **Dependencias** — versiones desactualizadas o deprecadas en `package.json`.
6. **TODOs y FIXMEs** abiertos: `grep -rn "TODO\|FIXME\|HACK" lib app components`.

## Riesgos estructurales a evaluar

Más allá de los números, comprueba y reporta:

- **Puntos únicos de fallo.** Yahoo es fuente única de precios, fundamentales y
  cadenas de opciones. ¿Hay cache de último-bueno o cae todo?
- **Acoplamiento a formas serializadas.** Los blobs de `valuation_scores` guardan
  objetos completos; cambiar un tipo rompe las filas antiguas silenciosamente.
- **Lógica financiera duplicada.** El mismo cálculo (upside, descuento, score) hecho
  en dos sitios acaba divergiendo y mostrando números distintos en dos pantallas.
- **Umbrales mágicos.** Constantes sin justificar dentro de motores de decisión.
  ¿Están en `lib/constants.ts` con su porqué, o hardcodeadas?
- **Endpoints sin protección** ni rate-limit que hacen trabajo caro.

## Informe

Un cuadro de mando corto en español, con esta forma:

| Dimensión | Medida | Estado |
|---|---|---|
| Typecheck | 0 errores | 🟢 |
| Lint | N errores / M warnings | 🟡 |
| Tests | X suites / Y tests para Z rutas | 🔴 |

Después, los tres riesgos estructurales más caros, cada uno con su acción concreta y
una estimación de esfuerzo. Termina con **la única cosa** que más mejoraría la salud
del proyecto si solo se pudiera hacer una.

No propongas reescrituras. Propón el siguiente paso realista.
