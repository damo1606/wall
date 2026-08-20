---
name: ship
description: |
  Lleva un cambio a producción con seguridad: puertas verdes, commit limpio, rama y
  PR. Úsala cuando el usuario quiera desplegar, subir, publicar o abrir un PR.
  Frases disparadoras: "ship", "despliega", "sube esto", "haz push", "crea el PR",
  "publica", "mándalo a producción".
user_invocable: true
---

# Ship — wall

Este repo alimenta decisiones de inversión. Un despliegue con una señal mal calculada
es peor que no desplegar. Las puertas no son burocracia.

## Entorno

```powershell
$env:PATH = "C:\Users\daniel.montero\node\node-v22.14.0-win-x64;$env:PATH"
```

## Paso 1 — Puertas (bloqueantes)

Las cuatro en verde antes de tocar git. Si alguna falla, **para y arréglalo**; no
shippees con puertas rojas salvo que el usuario lo ordene explícitamente tras leer
el fallo.

```powershell
node .\node_modules\typescript\bin\tsc --noEmit
node .\node_modules\jest\bin\jest.js
node .\node_modules\eslint\bin\eslint.js .
node .\node_modules\next\dist\bin\next build
```

`next build` es obligatorio: es lo único que valida el grafo de Server/Client
Components, y un fallo ahí rompe el deploy de Vercel aunque tsc pase.

## Paso 2 — Revisar el diff de verdad

`git diff` completo, leído. Busca antes de commitear:

- Secretos, tokens o claves. Nada sensible bajo `NEXT_PUBLIC_`.
- `console.log` de depuración y código comentado.
- Cambios de **coeficientes o umbrales** de los motores (scoring, SORE, GEX): si los
  tocas, las señales históricas dejan de ser comparables. Debe ser intencionado y
  quedar dicho en el mensaje de commit.
- Migraciones SQL: ¿son idempotentes? ¿se han aplicado a la BD?

## Paso 3 — Rama

**Nunca commitees directamente a `main`.** Si estás en main, crea rama primero:

```
git checkout -b <tipo>/<descripcion-corta>
```

Tipos: `feat`, `fix`, `chore`, `docs`, `refactor`.

## Paso 4 — Commit

Mensajes en español, formato convencional, asunto en imperativo y ≤72 caracteres:

```
feat(consenso): usa el rango completo de analistas en el escenario de precios
```

El cuerpo explica **por qué**, no qué (el diff ya dice qué). Termina siempre con:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

No uses `--no-verify` ni saltes la firma. Si un hook falla, arregla la causa.

## Paso 5 — PR

`gh pr create` con cuerpo en español: qué cambia, por qué, cómo se verificó, y qué
riesgos tiene. Si el cambio mueve señales financieras, dilo en la primera línea.
Cierra el cuerpo con:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## Regla de confirmación

Commit, push y PR son acciones hacia fuera. **Pide confirmación antes de cada una**
salvo que el usuario ya haya dicho que procedas sin preguntar. Una autorización para
commitear no autoriza a pushear.

## Al terminar

Resume en español: qué se subió, en qué rama, URL del PR, estado de las puertas, y
qué queda pendiente de verificar en producción (p. ej. esperar al cron para que
repueble datos).
