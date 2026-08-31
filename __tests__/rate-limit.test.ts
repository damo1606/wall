import {
  comprobarLimite, registrarFallo, limpiarLimite, _reset,
  type RateLimitOptions,
} from "@/lib/rate-limit"

const OPTS: RateLimitOptions = {
  maxIntentos: 3,
  ventanaMs: 10_000,
  bloqueoBaseMs: 1_000,
  bloqueoMaxMs: 8_000,
}

const T0 = 1_000_000  // reloj inyectado: nada depende de Date.now()

beforeEach(() => _reset())

describe("rate-limit del login", () => {
  it("deja pasar mientras no se supere el límite", () => {
    for (let i = 0; i < OPTS.maxIntentos; i++) {
      expect(comprobarLimite("k", OPTS, T0).permitido).toBe(true)
      registrarFallo("k", OPTS, T0)
    }
    expect(comprobarLimite("k", OPTS, T0).permitido).toBe(true)
  })

  it("bloquea al superar el límite", () => {
    for (let i = 0; i <= OPTS.maxIntentos; i++) registrarFallo("k", OPTS, T0)
    const r = comprobarLimite("k", OPTS, T0)
    expect(r.permitido).toBe(false)
    if (!r.permitido) expect(r.esperaSegundos).toBeGreaterThan(0)
  })

  it("el bloqueo crece exponencialmente con cada fallo extra", () => {
    const esperas: number[] = []
    for (let i = 0; i <= OPTS.maxIntentos + 3; i++) {
      registrarFallo("k", OPTS, T0)
      const r = comprobarLimite("k", OPTS, T0)
      if (!r.permitido) esperas.push(r.esperaSegundos)
    }
    for (let i = 1; i < esperas.length; i++) {
      expect(esperas[i]).toBeGreaterThanOrEqual(esperas[i - 1])
    }
    expect(esperas[esperas.length - 1]).toBeGreaterThan(esperas[0])
  })

  it("respeta el techo de bloqueo", () => {
    for (let i = 0; i < 40; i++) registrarFallo("k", OPTS, T0)
    const r = comprobarLimite("k", OPTS, T0)
    expect(r.permitido).toBe(false)
    if (!r.permitido) expect(r.esperaSegundos).toBeLessThanOrEqual(OPTS.bloqueoMaxMs / 1000)
  })

  it("vuelve a permitir cuando pasa el bloqueo", () => {
    for (let i = 0; i <= OPTS.maxIntentos; i++) registrarFallo("k", OPTS, T0)
    expect(comprobarLimite("k", OPTS, T0).permitido).toBe(false)
    expect(comprobarLimite("k", OPTS, T0 + OPTS.bloqueoMaxMs + 1).permitido).toBe(true)
  })

  it("reinicia la cuenta si los fallos caen fuera de la ventana", () => {
    for (let i = 0; i <= OPTS.maxIntentos; i++) registrarFallo("k", OPTS, T0)
    expect(comprobarLimite("k", OPTS, T0).permitido).toBe(false)

    // Un fallo muy posterior abre una ventana nueva y no queda bloqueado.
    const tarde = T0 + OPTS.ventanaMs * 5
    registrarFallo("k", OPTS, tarde)
    expect(comprobarLimite("k", OPTS, tarde).permitido).toBe(true)
  })

  it("un login correcto limpia el historial", () => {
    for (let i = 0; i <= OPTS.maxIntentos; i++) registrarFallo("k", OPTS, T0)
    expect(comprobarLimite("k", OPTS, T0).permitido).toBe(false)
    limpiarLimite("k")
    expect(comprobarLimite("k", OPTS, T0).permitido).toBe(true)
  })

  it("aísla las claves entre sí", () => {
    for (let i = 0; i <= OPTS.maxIntentos; i++) registrarFallo("ip1|ana", OPTS, T0)
    expect(comprobarLimite("ip1|ana", OPTS, T0).permitido).toBe(false)
    // Otro usuario desde la misma IP no queda bloqueado por el primero.
    expect(comprobarLimite("ip1|luis", OPTS, T0).permitido).toBe(true)
    // Ni el mismo usuario desde otra IP.
    expect(comprobarLimite("ip2|ana", OPTS, T0).permitido).toBe(true)
  })

  it("comprobar no consume intentos", () => {
    for (let i = 0; i < 20; i++) comprobarLimite("k", OPTS, T0)
    expect(comprobarLimite("k", OPTS, T0).permitido).toBe(true)
  })
})
