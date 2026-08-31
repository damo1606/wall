---
name: investigate
description: |
  Diagnostica un bug hasta su causa raíz antes de tocar código. Úsala cuando algo
  falla: error 500, endpoint que devuelve vacío, señal que sale mal, página en
  blanco, cron que no corre, dato que no cuadra.
  Frases disparadoras: "esto está roto", "por qué falla", "error 500", "da vacío",
  "no funciona", "investiga", "debug", "el número está mal".
user_invocable: true
---

# Investigar un fallo — wall

El objetivo **no es que deje de fallar**, es entender por qué falla. Un parche sobre
una causa no entendida en un sistema de señales financieras esconde el problema hasta
que reaparece en una decisión de trading.

## Entorno

Node no está en el PATH. Antepón la instalación portable en cada comando:

```powershell
$env:PATH = "C:\Users\daniel.montero\node\node-v22.14.0-win-x64;$env:PATH"
```

Binarios: `node .\node_modules\<pkg>\...` — `npx` no existe.

## Paso 1 — Reproducir antes que teorizar

No arregles nada que no hayas visto fallar. Consigue el fallo delante:

- Endpoint → golpéalo con la entrada exacta que lo rompe y guarda la respuesta.
- Página → levanta `next dev` y ábrela; mira consola del navegador **y** del server.
- Número incorrecto → aísla la función pura y ejecútala con los datos reales.

Si no puedes reproducirlo, dilo y para. Un bug no reproducido no se arregla: se
investiga hasta reproducirlo o se cierra como no confirmado.

## Paso 2 — Delimitar la capa

Recorre la cadena de datos en orden y determina **dónde deja de ser correcto**:

```
Yahoo/SEC → lib/yahoo.ts → cron → Supabase → route.ts → page.tsx → UI
```

Preguntas que cortan el espacio de búsqueda rápido:

- ¿El dato llega mal de origen o se corrompe en el camino? Vuelca la respuesta cruda.
- ¿Es un problema de **frescura**? Compara `taken_at` de la fila con la hora actual.
- ¿Es una **fila cacheada con forma antigua**? Los blobs de `valuation_scores`
  guardan `{stock, score}` serializados; código nuevo que lee campos nuevos recibe
  `undefined` en filas viejas. Causa clásica de `Cannot read properties of undefined`.
- ¿Falla solo para algunos tickers? Busca el patrón: sin opciones, sin cobertura de
  analistas, sector financiero, market cap pequeño, ticker con punto o guion.

## Paso 3 — Sospechosos habituales de este repo

Antes de inventar hipótesis exóticas, descarta las causas que ya han mordido aquí:

| Síntoma | Causa frecuente |
|---|---|
| 500 global en scanner | `getCrumb()` de Yahoo falló — es punto único de fallo |
| Respuesta vacía sin error | `parseInt` sin guarda → `NaN` → `slice(0, NaN)` → `[]` |
| Número que sale 0 en vez de "—" | `?? 0` colapsando "sin dato" con cero |
| `-Infinity` en un máximo | `Math.max(...[])` sobre un array vacío |
| Porcentaje absurdo | división por un denominador que puede ser 0 |
| Cron sin efecto | falta `Authorization: Bearer CRON_SECRET` o el workflow no dispara |
| Página redirige a login | gate de sesión en `proxy.ts` |
| Estado que se pierde al re-render | `set-state-in-effect` / componente recreado en render |

Revisa también `cron_runs` en Supabase: guarda `status`, `error_summary` y duración
de cada ejecución. Suele contener la respuesta antes que los logs.

## Paso 4 — Causa raíz, no síntoma

Formula la causa en una frase que explique **todos** los hechos observados, no solo
el más visible. Si tu explicación no cubre por qué falla para AAPL pero no para KO,
aún no la tienes.

Comprueba la hipótesis con una modificación mínima y reversible antes de escribir el
arreglo definitivo.

## Paso 5 — Arreglar y blindar

1. Arregla la causa, no el síntoma.
2. **Añade un test de regresión** que falle sin el arreglo. Sin esto el bug vuelve.
3. Busca el mismo patrón en el resto del repo — estos errores vienen en familia.
4. Verifica: typecheck, el test nuevo, y reproduce de nuevo el escenario original.

## Informe

Explica en español y en este orden: qué falla (síntoma observable), por qué (causa
raíz), qué cambiaste, cómo lo verificaste, y qué otros sitios tenían el mismo patrón.
Si algo queda sin arreglar, dilo explícitamente en vez de dejarlo implícito.
