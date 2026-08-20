---
name: qa
description: |
  QA exhaustivo del proyecto wall — puertas estáticas, humo en runtime, revisión de
  dominio financiero y verificación adversarial de cada hallazgo, con informe por
  severidad. Úsala cuando el usuario pida QA, probar el sitio, buscar bugs, revisar
  la salud del sistema o auditar antes de desplegar.
  Frases disparadoras: "qa", "haz un qa", "prueba el sitio", "busca bugs",
  "revisa el sistema", "auditoría", "health check", "antes de desplegar".
user_invocable: true
---

# QA exhaustivo — wall

Auditoría de un dashboard financiero en Next.js 16 (App Router) que consume Yahoo
Finance y Supabase, con motores propios de scoring fundamental, GEX/opciones (M1–M8)
y SORE. **Un falso negativo aquí puede producir una señal de trading errónea**, así
que la barra es alta: nada se reporta sin reproducir, y nada se afirma sin verificar
con herramientas.

## Regla vinculante

Este proyecto exige factualidad estricta. **Prohibido afirmar el estado de algo sin
haberlo comprobado en esta ejecución.** Si un comando no se pudo correr, dilo; no
supongas que pasa. Si un hallazgo no se pudo reproducir, márcalo como *no confirmado*
en vez de presentarlo como bug.

## Paso 0 — Entorno

Node **no está en el PATH** de esta máquina. Hay una instalación portable:

```
C:\Users\daniel.montero\node\node-v22.14.0-win-x64
```

Antepónla al PATH en cada invocación de PowerShell (el estado del shell no persiste):

```powershell
$env:PATH = "C:\Users\daniel.montero\node\node-v22.14.0-win-x64;$env:PATH"
```

Invoca los binarios por su ruta dentro de `node_modules` (`npx` no existe):

| Tarea | Comando |
|---|---|
| Typecheck | `node .\node_modules\typescript\bin\tsc --noEmit` |
| Tests | `node .\node_modules\jest\bin\jest.js` |
| Lint | `node .\node_modules\eslint\bin\eslint.js .` |
| Build | `node .\node_modules\next\dist\bin\next build` |
| Dev server | `node .\node_modules\next\dist\bin\next dev` |

Antes de empezar, registra el estado de partida: `git status --short` y
`git log --oneline -5`. Un working tree sucio cambia cómo se interpretan los hallazgos.

## Paso 1 — Puertas estáticas

Corre las cuatro y anota el resultado exacto de cada una. Ejecuta las independientes
en paralelo. **No pares en el primer fallo** — necesitas el cuadro completo.

1. **Typecheck** — cero errores es la única salida aceptable.
2. **Tests** — apunta suites y tests que pasan/fallan. Compara la cobertura con el
   número de rutas (`app/api/**/route.ts`) para medir la deuda real.
3. **Lint** — cuenta y agrupa por regla. Distingue ruido cosmético
   (`no-explicit-any`) de señales de bug real: `react-hooks/set-state-in-effect`
   (bucles de render), `static-components` (remontajes que tiran estado),
   `exhaustive-deps` (closures obsoletas).
4. **Build de producción** — es la única puerta que valida el grafo de Server/Client
   Components y la generación de rutas.

## Paso 2 — Humo en runtime

El build que compila no prueba que la app responda. Levanta el dev server en segundo
plano, espera a que escuche y golpea las rutas reales.

- Comprueba el **gate de sesión**: las páginas y los endpoints de cómputo deben
  redirigir o rechazar sin cookie válida. Verifica que un endpoint protegido
  devuelve 401/redirect y que uno público (si lo hay) es intencionadamente público.
- Golpea los endpoints de datos con entradas **válidas, vacías y malformadas**:
  ticker inexistente, `?limit=abc`, parámetro ausente. Un `NaN` que se propaga hasta
  un `slice()` produce una respuesta vacía silenciosa, que es peor que un 400.
- Anota latencias. Un endpoint que tarda ~100s (fallback a Yahoo) es un riesgo
  operativo aunque devuelva 200.
- Apaga el servidor al terminar.

## Paso 3 — Revisión por área

Cubre las ocho. Para cada una, lee el código y busca el fallo concreto, no la
impresión general.

1. **Auth y exposición** — `proxy.ts`, `lib/auth.ts`. ¿Qué rutas quedan fuera del
   gate? ¿Hay rate-limiting en login? ¿`/api/debug` sigue expuesto? Los crons deben
   exigir `Authorization: Bearer CRON_SECRET`.
2. **Secretos** — que ninguna clave llegue al bundle de cliente. Busca `NEXT_PUBLIC_`
   sobre valores sensibles y credenciales hardcodeadas.
3. **Integridad numérica** — el corazón del riesgo. Divisiones por cero, `?? 0` que
   colapsa "sin dato" con "cero" (falsea señales), `parseInt` sin guarda de `NaN`,
   `Math.max(...[])` que da `-Infinity`, y porcentajes calculados sobre denominadores
   que pueden ser 0.
4. **Yahoo como fuente única** — `lib/yahoo.ts`. Clasificación de errores, backoff,
   caducidad del crumb, y qué pasa si `getCrumb()` falla: ¿degradación parcial o 500
   global? Comprueba los campos que se leen contra la respuesta real de la API.
5. **Motores financieros** — `lib/scoring.ts`, `lib/gex7.ts`, `lib/opportunity.ts`,
   `computeSORE` en `app/api/scanner-pro/route.ts`. Verifica que los pesos suman lo
   declarado, que los scores quedan en 0–100, que los umbrales de gate son coherentes
   y que ninguna métrica premia lo que debería castigar. Reproduce con datos reales.
6. **Caché y frescura** — TTL por señal. Mezclar un score de hoy con short interest
   de hace un mes produce señales falsas. Cuidado con los blobs de `valuation_scores`:
   una fila cacheada con forma antigua puede romper código nuevo que lee campos que
   esa fila no tiene.
7. **Consistencia de UI** — que dos pantallas no muestren números distintos para la
   misma magnitud, y que "sin dato" se pinte como `—` y no como `0%`.
8. **Crons y migraciones** — `.github/workflows/cron-*.yml` frente a los handlers de
   `app/api/cron/**`. Migraciones sin aplicar. Idempotencia de los upserts.

Relee `docs/AUDITORIA_SORE.md` y `docs/AUDITORIA_PENDIENTES.md` y **verifica contra
el código actual** si los hallazgos previos siguen vivos. Un hallazgo documentado no
es un hallazgo presente.

## Paso 4 — Verificación adversarial

Antes de reportar nada, intenta **refutar** cada hallazgo. Para cada uno responde:

- ¿Cuál es la entrada concreta que lo dispara y cuál la salida errónea?
- ¿Hay una guarda aguas arriba que lo hace inalcanzable?
- ¿Es comportamiento intencionado y documentado?

Ante la duda, descarta. Un informe con 6 hallazgos reales vale más que uno con 20 de
los que 14 son ruido. Marca cada superviviente como **CONFIRMADO** (reproducido) o
**PLAUSIBLE** (razonado pero no ejecutado).

## Paso 5 — Informe

Ordena por severidad, no por área:

- 🔴 **CRÍTICO** — señal de trading errónea, pérdida de datos, secreto expuesto o
  caída total.
- 🟠 **ALTO** — funcionalidad rota, endpoint sin proteger, riesgo de coste.
- 🟡 **MEDIO** — calibración dudosa, degradación silenciosa, deuda que ya muerde.
- 🟢 **BAJO** — robustez, validación, cosmética.

Cada hallazgo lleva: **archivo:línea**, qué falla, el **escenario de fallo concreto**
(entrada → salida errónea), impacto y acción recomendada. Cierra con lo que está
bien (evita reintroducir regresiones) y una lista de prioridades.

Escribe el informe en `docs/QA_<YYYY-MM-DD>.md` además de resumirlo en el chat, y
guarda en memoria los hallazgos que queden sin arreglar.
