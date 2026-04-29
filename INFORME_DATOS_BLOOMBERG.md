# INFORME DE REQUERIMIENTOS DE DATOS — PLATAFORMA WALL
**Fecha:** 24 de abril de 2026
**Clasificación:** Interno — Arquitectura de Datos
**Plataforma:** Wall — Motor de Análisis de Opciones Institucional (7 Metodologías)

---

## 1. CONTEXTO Y ESTADO ACTUAL

Wall es una plataforma de análisis cuantitativo de opciones que ejecuta 7 metodologías independientes sobre cualquier ticker del mercado americano:

- **M1** — Perfil de Gamma Exposure (GEX), Vanna y Dealer Flow por strike
- **M2** — Z-Score GEX + Put/Call Ratio con Institutional Pressure Score
- **M3** — Confluencia 3D multi-vencimiento ponderada por tiempo (DTE)
- **M4** — Heatmap 2D de Open Interest e IV Skew (strike × vencimiento)
- **M5** — Señal consolidada multi-metodología (score −100 a +100)
- **M6** — Régimen de mercado en tiempo real (COMPRESIÓN / PÁNICO / CRISIS)
- **M7** — Veredicto final con S/R institucional y timing multi-marco

El motor produce niveles de Call Wall, Put Wall, Gamma Flip, soportes y resistencias institucionales, IV ATM / IV Rank / IV Percentile, skew 25-Delta por vencimiento y un score de veredicto ponderado por confianza metodológica.

**Limitación crítica actual:** la totalidad de los datos de opciones proviene de Yahoo Finance, que entrega IVs inconsistentes entre contratos, no expone greeks directamente, no tiene historial estructurado de Open Interest, opera con delay de 15 minutos en datos intradía y no provee flujo real de dealers ni posicionamiento institucional verificado.

Bloomberg resuelve cada una de estas limitaciones con datos de grado institucional. Este informe detalla qué datos se requieren, por qué son necesarios y cuál es el resultado final que habilitan.

---

## 2. DATOS DISPONIBLES EN YAHOO FINANCE (BASE ACTUAL)

Estos datos ya están integrados o son integrables sin costo adicional. Se documentan para establecer la línea base.

### 2.1 Índices de Volatilidad de Mercado

| Dato | Ticker Yahoo | Disponibilidad |
|------|-------------|----------------|
| VIX spot | `^VIX` | Sí, 15min delay |
| VIX 9 días | `^VIX9D` | Sí, 15min delay |
| VIX 3 meses | `^VIX3M` | Sí, 15min delay |
| VIX 6 meses | `^VIX6M` | Sí, 15min delay |
| VVIX (vol del VIX) | `^VVIX` | Sí, 15min delay |
| SKEW Index CBOE | `^SKEW` | Sí, 15min delay |
| Put/Call Ratio agregado | `^PCALL` | Sí, 15min delay |

### 2.2 Cadena de Opciones por Ticker

| Dato | Fuente | Limitación |
|------|--------|-----------|
| Open Interest por contrato | `ticker.option_chain()` | Solo snapshot actual, sin historial |
| Volumen por contrato | `ticker.option_chain()` | Solo sesión actual |
| Implied Volatility por contrato | `ticker.option_chain()` | Inconsistente entre strikes |
| Bid / Ask por contrato | `ticker.option_chain()` | Disponible |
| Precio último por contrato | `ticker.option_chain()` | Disponible |
| In/Out the money flag | `ticker.option_chain()` | Disponible |
| Fechas de expiración disponibles | `ticker.options` | Disponible |

### 2.3 Greeks — NO disponibles en Yahoo Finance

Yahoo Finance **no expone** Delta, Gamma, Theta, Vega, Rho, Vanna, Charm ni ningún greek de primer o segundo orden. Wall los calcula localmente usando Black-Scholes sobre la IV de Yahoo. Esta es la principal limitación técnica de la arquitectura actual, detallada en la Sección 3.

### 2.4 Datos de Precio y Fundamentales

| Dato | Disponible en Yahoo |
|------|-------------------|
| OHLCV histórico (1m hasta 3mo) | Sí |
| Market cap, P/E, EPS | Sí, parcial |
| Short interest y float | Sí, parcial |
| Fechas de earnings | Sí |
| Datos macroeconómicos | No |

---

## 3. DATOS QUE REQUIEREN BLOOMBERG — ANÁLISIS COMPLETO

---

### 3.1 SUPERFICIE DE VOLATILIDAD IMPLÍCITA COMPLETA

**Dato:** Superficie de IV ajustada por skew y term structure, arbitrage-free, en tiempo real para cualquier par (strike, vencimiento).

**Campo Bloomberg:** `OVDV` — campos `ATM_VOL`, `25D_PUT_VOL`, `25D_CALL_VOL`, `10D_PUT_VOL`, `10D_CALL_VOL` por cada vencimiento. Acceso via `BDP` y `BDH`.

**Por qué es necesario:**

La Metodología 4 (Heatmap 2D) y el componente `SkewPanel` calculan el IV Skew como la diferencia entre la IV del put y la IV del call en el mismo strike. Yahoo devuelve una IV por contrato calculada individualmente, sin garantía de consistencia entre contratos del mismo vencimiento ni entre vencimientos distintos. Los valores pueden tener gaps de tiempo de varios minutos entre sí, lo que introduce ruido estructural en la superficie. En vencimientos superiores a 60 días, Yahoo frecuentemente no tiene suficientes contratos con liquidez para interpolar el 25-Delta real, por lo que el skew 25D que muestra el `SkewPanel` en la curva de term structure es una aproximación con errores del orden del 15–30% en esos plazos.

Bloomberg `OVDV` entrega una superficie de volatilidad construida sobre precios mid actualizados simultáneamente, interpolada con modelos de no-arbitraje (SVI o SABR según el activo) y que incorpora el mercado OTC de opciones, que tiene 3–5 veces más liquidez que el mercado listado en los vencimientos superiores a 90 días. El skew 25-Delta que actualmente calcula Wall como aproximación, Bloomberg lo entrega como observable directo del mercado.

**Resultado final habilitado:**

La Metodología 4 pasaría de mostrar un heatmap con ruido a mostrar la superficie de volatilidad que usan los traders institucionales para valuar sus opciones. La term structure de skew 25-Delta de la M4 y el `SkewPanel` reflejaría el posicionamiento real del mercado OTC, que anticipa eventos de riesgo con 5–15 días de adelanto respecto al mercado listado. Cuando la superficie OTC invierte la estructura normal de plazos — los vencimientos cortos se vuelven más caros que los largos — históricamente precede a episodios de PÁNICO en el VIX spot. Con Bloomberg, la Metodología 6 podría usar esta inversión como quinta señal de detección de régimen, siendo la más anticipada de todas las señales disponibles.

---

### 3.2 GREEKS EN TIEMPO REAL CALCULADOS CON SUPERFICIE REAL

**Dato:** Delta, Gamma, Theta, Vega, Rho (primer orden) y Vanna, Charm, Vomma, DvegaDvol (segundo orden) por contrato, calculados sobre la superficie real del mercado, no sobre Black-Scholes flat.

**Campo Bloomberg:** `OMON` con campos `OPT_DELTA`, `OPT_GAMMA`, `OPT_THETA`, `OPT_VEGA`, `OPT_VANNA`, `OPT_CHARM` por contrato. Alternativamente `OVDV` para derivarlos desde la superficie.

**Por qué es necesario:**

Wall calcula todos sus greeks localmente con Black-Scholes usando la IV que devuelve Yahoo por contrato. Este enfoque tiene un defecto fundamental: Black-Scholes asume una IV constante para todos los strikes del mismo vencimiento (distribución log-normal), pero el mercado real tiene un skew — los puts OTM tienen sistemáticamente mayor IV que los calls OTM. Cuando se calcula el Gamma de un put OTM con la IV del modelo teórico en lugar de la IV real del mercado, el error puede ser del 20–45% dependiendo del grado de skew del activo.

Este error se propaga directamente al GEX (Gamma Exposure) de la Metodología 1. El GEX se calcula como `OI × Gamma × SpotPrice² × 0.01` — si el Gamma es 30% más bajo que el real, el GEX de ese strike es 30% más bajo, lo que desplaza los niveles de Call Wall, Put Wall y Gamma Flip. En la práctica, esto significa que los niveles que Wall identifica como soportes y resistencias mecánicas están sistemáticamente desplazados respecto a los niveles reales donde los dealers deben hedgear.

La Vanna (`dDelta/dVol`) es el greek que más se ve afectado: su valor depende directamente de la pendiente de la superficie de volatilidad (el skew), que Black-Scholes plano no captura por definición. El `VannaChart.tsx` actual muestra una Vanna que es esencialmente cero en la cola del skew, cuando en el mercado real la Vanna OTM puede ser la mayor del espectro.

**Resultado final habilitado:**

El GEX de la M1 con greeks reales de Bloomberg reduciría el error de estimación de los niveles de Call Wall, Put Wall y Gamma Flip del ~30–40% actual a menos del 5%, que es el margen de error propio del modelo de posicionamiento de dealers (no eliminable sin datos de OCC directos). El `VannaChart` mostraría la exposición Vanna real del mercado, que es la variable que mueve los precios cuando la IV sube o baja bruscamente — el motor principal detrás de los movimientos en días de datos macro como FOMC o CPI. Con Vanna real, la M6 podría calcular la aceleración de precio esperada ante un movimiento de X puntos de IV, convirtiendo el régimen de mercado en un indicador cuantitativo de magnitud, no solo de dirección.

---

### 3.3 OPEN INTEREST HISTÓRICO DIARIO

**Dato:** Serie histórica diaria de Open Interest por contrato (strike + vencimiento) desde el primer día de listado.

**Campo Bloomberg:** `OPSD` — campo `OPT_OPEN_INT` con `periodicitySelection: DAILY` via `BDH`. Histórico completo disponible desde la fecha de listado del contrato.

**Por qué es necesario:**

Las Metodologías 2 y 3 calculan Z-Scores de GEX y OI para identificar strikes con presión institucional estadísticamente inusual. El Z-Score requiere una distribución histórica para ser calculable: `(valor_actual − media_histórica) / desviación_estándar_histórica`. Actualmente Wall calcula este Z-Score sobre el snapshot único del momento del análisis — equivale a calcular la desviación estándar de un solo punto, lo que matemáticamente produce un Z-Score sin significancia estadística.

Sin historial de OI, el sistema no puede distinguir entre un strike que siempre tiene mucho OI (por su posición ATM frecuente) y un strike donde el OI está creciendo de forma anómala en los últimos días — que es la señal de acumulación institucional intencional. Bloomberg `OPSD` entrega hasta 10 años de OI diario, permitiendo construir distribuciones con 252–2,520 observaciones por contrato.

**Resultado final habilitado:**

La Metodología 2 (Z-Score GEX + PCR) se convertiría en un sistema de detección de acumulación institucional con significancia estadística real. Un Z-Score calculado sobre 252 días de historia tiene p-values interpretables: un score de 2.0 significa que ese nivel de OI ocurre menos del 5% de las veces históricamente — señal de posicionamiento intencional. La Metodología 3 (Confluencia 3D) obtendría el mismo beneficio en su eje de OI: el peso de cada vencimiento reflejaría no solo cuánto OI existe hoy, sino si ese OI es anómalo respecto al comportamiento histórico del activo. El resultado práctico es que el "Confluence Score" de M3 identificaría niveles donde hay dinero institucional acumulado intencionalmente, no solo niveles donde coincide el posicionamiento del día.

---

### 3.4 FLUJO NETO DE DEALERS Y POSICIONAMIENTO POR CATEGORÍA DE PARTICIPANTE

**Dato:** Flujo de opciones y acciones separado por categoría de contraparte: market makers, hedge funds, retail, corporates. Volumen de dark pools (ATS) y block trades.

**Campo Bloomberg:** `TSOX` (Trade Surveillance & Options Flow), `ALLX` (All Exchange feed), campos `DARK_POOL_VOL`, `BLOCK_TRADE_VOLUME`, `MM_NET_DELTA`, `HF_NET_DELTA` via feed Bloomberg B-PIPE.

**Por qué es necesario:**

El `DealerFlowChart.tsx` de Wall proyecta cómo deben hedgear los dealers calculando el flujo mecánico implícito desde el GEX — es un modelo del comportamiento esperado de los market makers. Es una estimación teóricamente sólida pero que no puede capturar dos realidades críticas del mercado: (1) los dealers no siempre hedgean en la proporción teórica — en mercados ilíquidos o bajo presión reducen su actividad de hedging; (2) el flujo real del mercado incluye entre el 35% y el 45% de volumen que ocurre en dark pools (ATS), completamente invisible para cualquier fuente de datos pública incluyendo Yahoo Finance.

Bloomberg `TSOX` tiene acceso al feed del FINRA TRF (Trade Reporting Facility), que es donde se reportan todas las transacciones de dark pools en renta variable americana. Esto incluye las órdenes de bloque de hedge funds que mueven el mercado antes de que sean visibles en el tape público. La distinción entre puts comprados (cobertura institucional) y puts vendidos (income/income) — que actualmente Wall no puede hacer — cambia la señal del PCR por completo: el mismo OI puede representar miedo bajista o complacencia alcista dependiendo de quién está del otro lado.

**Resultado final habilitado:**

Wall podría agregar una capa de confirmación de flujo real a los niveles que identifica mediante GEX. Un soporte identificado por la M7 con 4/4 metodologías convergentes, reforzado por acumulación institucional en dark pools en las 3–5 sesiones previas, tiene una tasa de éxito históricamente superior al 70% según literatura de microestructura de mercado. Sin datos de dark pool, el sistema no puede distinguir entre un soporte "vacío" (que existe en los modelos pero no tiene dinero real detrás) y un soporte "cargado" (donde hay órdenes institucionales reales esperando). Esta distinción es la de mayor impacto directo para el usuario final: saber si el nivel que le muestra el sistema tiene dinero real detrás o es un artefacto del modelo.

---

### 3.5 PUT/CALL RATIO GRANULAR CON DIRECCIÓN DE FLUJO

**Dato:** PCR separado por volumen de sesión vs OI acumulado, con dirección del flujo (compras vs ventas) por strike y vencimiento.

**Campo Bloomberg:** `OMON` — campos `PUT_CALL_RATIO_VOL` (flujo del día), `PUT_CALL_RATIO_OI` (acumulado), `OPT_BID_VOL`, `OPT_ASK_VOL` para inferir dirección, o `TSOX` con `BUY_VOL` / `SELL_VOL` por contrato.

**Por qué es necesario:**

Las Metodologías 2 y 3 calculan un PCR por strike (OI puts / OI calls) como componente del Institutional Pressure Score y el Confluence Score. Este PCR combina posiciones de días anteriores con flujo nuevo sin distinción. Más crítico: no diferencia entre una institución comprando puts (cobertura bajista real, señal de miedo) y otra institución vendiendo puts (income strategy, señal alcista). Ambas producen el mismo OI en el lado put, pero son señales opuestas.

Bloomberg `OMON` entrega el PCR de volumen de la sesión actual separado del PCR de OI acumulado, y el feed `TSOX` permite distinguir si las transacciones se realizaron al precio bid (vendedor agresivo) o al precio ask (comprador agresivo). Esta distinción — conocida como "tick rule" o "Lee-Ready algorithm" — es el estándar institucional para determinar la dirección del flujo.

**Resultado final habilitado:**

El Confluence Score de la Metodología 3 incorporaría la dirección real del dinero institucional en cada strike. Actualmente el sistema puede confundir una zona donde los fondos están *vendiendo* protección (señal alcista) con una zona donde están *comprando* protección (señal bajista) porque ambas producen el mismo OI. Con el PCR direccional de Bloomberg, el error de clasificación direccional de los strikes se reduciría aproximadamente un 30%, según la proporción de trades que históricamente se ejecutan en contra de la dirección del OI acumulado en el mercado de opciones americano.

---

### 3.6 VIX Y VOLATILITY INDICES EN TIEMPO REAL (SIN DELAY)

**Dato:** VIX spot, VIX9D, VIX3M, VIX6M, VVIX, SKEW Index — todos en tiempo real sin delay, actualizados tick a tick.

**Campo Bloomberg:** `VIX Index`, `VIX9D Index`, `VIX3M Index`, `VIX6M Index`, `VVIX Index`, `SKEW Index` con `FIELD: PX_LAST` via `BDP` en tiempo real. Feed tick-by-tick disponible via B-PIPE.

**Por qué es necesario:**

La Metodología 6 (Régimen de Mercado) es el componente que determina si las señales de las otras 6 metodologías son operables o deben suspenderse. Usa el VIX spot, la relación VIX/VIX3M y el speed del VIX (+% en 5 días) como señales primarias de régimen, con pesos del 35%, 25% y componente de velocidad respectivamente. Yahoo Finance entrega estos datos con un delay mínimo de 15 minutos, y en la práctica los datos de VVIX y SKEW frecuentemente tienen gaps de actualización de 20–30 minutos.

En días de eventos macroeconómicos de alta impacto (FOMC, NFP, CPI, earnings de mega-cap), el VIX puede moverse 3–8 puntos en los primeros 30 segundos post-publicación. Con 15 minutos de delay, la M6 puede estar reportando régimen COMPRESIÓN cuando el mercado ya entró en PÁNICO AGUDO — el multiplicador de régimen estaría amplificando señales (×1.2) en un momento donde debería suspenderlas. Bloomberg entrega estos índices en tiempo real sin delay, con latencia de milisegundos via B-PIPE.

**Resultado final habilitado:**

La Metodología 6 detectaría cambios de régimen en tiempo real, permitiendo que el multiplicador de régimen reaccione al mercado actual. En sesiones de alta volatilidad, esta diferencia de 15 minutos es la diferencia entre amplificar una señal correcta y amplificar una señal obsoleta. Adicionalmente, con la serie histórica completa de Bloomberg, el detector de velocidad del VIX podría calibrarse con datos de todos los episodios de volatilidad desde 1990, incluyendo el crash de 2008, el COVID de 2020 y el VIX shock de 2018 — estableciendo thresholds de PÁNICO y CRISIS estadísticamente robustos en lugar de los valores fijos actuales.

---

### 3.7 HISTORIAL COMPLETO DE IV PARA IV RANK E IV PERCENTILE

**Dato:** Serie histórica diaria de IV ATM (y por delta específico) para cualquier ticker americano, desde su fecha de listado hasta la actualidad.

**Campo Bloomberg:** `BDH` con campo `30DAY_IMPVOL_100.0%MNY_DF` (IV ATM 30 días), `HIST_CALL_IMP_VOL`, `HIST_PUT_IMP_VOL` con `periodicitySelection: DAILY`. Disponible hasta 10 años de historia para la mayoría de tickers.

**Por qué es necesario:**

Wall muestra IV ATM, IV Rank e IV Percentile en el header de análisis de la página de GEX. El IV Rank se calcula como `(IV_actual − IV_min_año) / (IV_max_año − IV_min_año)` — requiere el máximo y mínimo de IV de los últimos 252 días hábiles. Actualmente estos valores se acumulan en Supabase desde el momento en que un usuario analiza un ticker por primera vez. La consecuencia es que la UI muestra explícitamente "acumulando historial" para tickers que no han sido analizados frecuentemente, y el IV Rank es estadísticamente inválido hasta tener al menos 60–90 observaciones (2–4 meses de uso).

Bloomberg `BDH` entrega hasta 10 años de IV ATM histórica en una sola llamada API. Con eso, el IV Rank y IV Percentile son calculables desde el primer análisis de cualquier ticker, con datos suficientes para ser estadísticamente significativos desde el día uno.

**Resultado final habilitado:**

El IV Rank y IV Percentile de Wall serían confiables desde el primer uso, para cualquier ticker americano sin excepción. La primera vez que un usuario analice un mid-cap poco seguido, recibiría un IV Rank basado en 5 años de historia — la misma calidad de análisis que para SPY. Esto además permitiría incorporar en la M6 el IV Rank como quinta señal de régimen: una IV en percentil histórico superior al 90% predice compresión de volatilidad inminente con mayor confiabilidad que el nivel absoluto del VIX, porque ajusta por el perfil de volatilidad específico del activo. Un VIX de 25 no tiene el mismo significado para un ETF de bonos que para una biotecnológica small-cap — el IV Rank normalizaría esta diferencia.

---

### 3.8 DATOS DE EVENTOS CORPORATIVOS Y CALENDARIO MACROECONÓMICO

**Dato:** Fechas exactas de earnings, dividendos, splits, vencimientos de lock-ups, eventos de índice (inclusión/exclusión S&P 500) y calendario macroeconómico (FOMC, NFP, CPI, PPI, PCE) con consenso de expectativas.

**Campo Bloomberg:** `BDH`/`BDP` con campos `EARN_ANN_DT`, `DVD_EX_DT`, `SPLIT_DT`, `ECO_RELEASE_DT` via Economic Calendar. Monitor de eventos via `EVTS`.

**Por qué es necesario:**

Las opciones pricing incorporan eventos corporativos y macroeconómicos en forma de "event vol" — la IV de los contratos que incluyen una fecha de earnings es sistemáticamente más alta que los que no la incluyen. Wall actualmente no tiene acceso a este calendario estructurado, lo que significa que el `SkewPanel` puede mostrar una estructura de plazos invertida (skew más alto en vencimientos cortos) sin poder determinar si se debe a un evento específico anticipado por el mercado o a una señal real de estrés sistémico. Bloomberg `EVTS` entrega el calendario completo con las fechas de todos los eventos para cualquier ticker, junto con el consenso de expectativas del mercado.

**Resultado final habilitado:**

La Metodología 6 (Régimen de Mercado) y la Metodología 7 (Veredicto Final) podrían incorporar el contexto de eventos como capa de interpretación. Un soporte identificado por M7 con 4/4 metodologías, con earnings en 48 horas, tiene un perfil de riesgo completamente diferente al mismo soporte sin eventos próximos — el primero puede fallar por el "vol crush" post-earnings aunque el posicionamiento de opciones lo respalde. La plataforma podría mostrar automáticamente "EVENTO PRÓXIMO — ajustar stops" cuando la ventana de análisis coincide con un catalizador del calendario Bloomberg. Esto convertiría el Veredicto Final de M7 de un análisis técnico-cuantitativo a un análisis que incorpora el ciclo de información del mercado.

---

## 4. TABLA RESUMEN DE REQUERIMIENTOS

| Bloque | Dato | Campo Bloomberg | Metodologías impactadas | Impacto |
|--------|------|----------------|------------------------|---------|
| 3.1 | Superficie de IV completa | `OVDV` | M4, M6, SkewPanel | Elimina inconsistencias de IV entre strikes |
| 3.2 | Greeks con superficie real | `OMON`, `OVDV` | M1, M5, M6, M7 | Reduce error de GEX del ~35% a <5% |
| 3.3 | OI histórico diario | `OPSD` BDH | M2, M3 | Z-Scores estadísticamente válidos |
| 3.4 | Flujo dealers y dark pools | `TSOX`, `ALLX` | M1, M7 | Confirmación institucional real |
| 3.5 | PCR con dirección de flujo | `OMON`, `TSOX` | M2, M3 | Reduce error de clasificación ~30% |
| 3.6 | VIX indices en tiempo real | `VIX Index` B-PIPE | M6 | Detección de régimen sin delay |
| 3.7 | Historial IV ATM | `BDH` IMPVOL | M6, header | IV Rank válido desde el día 1 |
| 3.8 | Calendario de eventos | `EVTS`, `BDP` | M6, M7 | Interpretación de skew por eventos |

---

## 5. IMPACTO ACUMULADO — RESULTADO FINAL DE LA PLATAFORMA

La integración de los 8 bloques de datos Bloomberg transformaría Wall en los siguientes ejes medibles:

**Precisión de niveles (M1, M7):** Los niveles de Call Wall, Put Wall y Gamma Flip tendrían un error de estimación reducido del ~35% actual a menos del 5%, usando greeks calculados con la superficie de vol real en lugar de Black-Scholes flat. Los niveles de soporte y resistencia de la M7 reflejarían el posicionamiento mecánico real de los dealers, no una aproximación.

**Significancia estadística (M2, M3):** Los Z-Scores de GEX y OI pasarían de ser comparaciones sin referencia a comparaciones contra distribuciones de 252+ días con p-values calculables. Un Confluence Score de 3.0 significaría un nivel estadísticamente inusual al nivel de confianza del 99%, no solo "alto respecto al resto de la cadena hoy".

**Anticipación de régimen (M6):** La detección de cambios de régimen operaría en tiempo real (sin delay de 15 minutos) y con una señal adelantada adicional — la inversión de la estructura de plazos de vol — que históricamente precede episodios de PÁNICO 5–15 días antes de que el VIX spot lo refleje.

**Confirmación institucional (M7):** El Veredicto Final incorporaría flujo real de dark pools como capa de confirmación. Niveles de S/R con respaldo de acumulación institucional en dark pools tienen una tasa de éxito históricamente superior al 70%, vs el ~55% de los niveles identificados solo por modelos de GEX sin confirmación de flujo.

**Cobertura universal (header, M6):** IV Rank funcional desde el primer análisis para cualquier ticker del mercado americano, sin período de acumulación, con calidad estadística homogénea entre SPY y cualquier small-cap.

**Interpretación contextual (M6, M7):** El sistema sabría cuándo un patrón de skew es estructural y cuándo es el resultado de un evento próximo, permitiendo al usuario distinguir entre una señal de posicionamiento real y un artefacto del ciclo de earnings o del calendario macro.

---

## 6. ESPECIFICACIÓN DE ACCESO

**Opción A — Bloomberg Terminal + Excel/API:** Acceso completo a todos los datos. Costo aproximado $24,000–$30,000/año por terminal. Viable para uso directo del equipo.

**Opción B — Bloomberg B-PIPE (Enterprise Data Feed):** Feed de datos programático directo para integración con la plataforma. Costo aproximado $60,000–$120,000/año según volumen de tickers y fields. Viable para producto con múltiples usuarios.

**Opción C — Bloomberg Data License (BDL):** Descarga masiva de datos históricos (OI histórico, IV histórica, superficie de vol). Costo variable según dataset. Viable para poblar la base de datos histórica una sola vez.

**Alternativas de costo reducido para funcionalidades específicas:**
- CBOE DataShop (~$300/mes): superficie IV, SKEW granular, historial de greeks
- Unusual Whales API (~$99/mes): flujo institucional aproximado, dark pools como proxy
- OptionMetrics (académico): historial completo de greeks y superficie IV desde 1996

---

*Documento elaborado para decisión de arquitectura de datos — Plataforma Wall*
*Fuente actual: Yahoo Finance (gratuito, 15min delay, sin greeks, sin historial)*
*Fuente propuesta: Bloomberg Terminal / B-PIPE / BDL*
