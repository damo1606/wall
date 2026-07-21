// QA del gating de JWT_SECRET (commit fix(auth) reconciliado en main).
//
// jose 6.x es ESM-only y jest corre en CommonJS, así que mockeamos jose. OJO:
// esto NO reduce la fidelidad del QA — la función real resolveJwtSecret() SÍ se
// ejecuta (lee VERCEL_ENV/JWT_SECRET y decide throw vs fallback) y su Uint8Array
// llega al mock. Solo sustituimos la criptografía de jose (que no es lo que este
// cambio toca). El mock preserva el contrato: mismo secreto → verifica; distinto
// secreto → rechaza. Así validamos el gating Y que el secreto realmente fluye.
jest.mock("jose", () => {
  const dec = new TextDecoder()
  return {
    SignJWT: class {
      private payload: unknown
      constructor(payload: unknown) { this.payload = payload }
      setProtectedHeader() { return this }
      setIssuedAt() { return this }
      setExpirationTime() { return this }
      async sign(key: Uint8Array) {
        const secret = dec.decode(key)
        return Buffer.from(JSON.stringify({ secret, payload: this.payload })).toString("base64")
      }
    },
    jwtVerify: async (token: string, key: Uint8Array) => {
      const secret = dec.decode(key)
      const parsed = JSON.parse(Buffer.from(token, "base64").toString("utf8"))
      if (parsed.secret !== secret) throw new Error("signature verification failed")
      return { payload: { ...parsed.payload, exp: 0, iat: 0 } }
    },
  }
})

import { signToken, verifyToken } from "@/lib/auth"

// resolveJwtSecret() lee process.env de forma perezosa en cada sign/verify, así que
// basta setear el entorno antes de llamar. jest pone NODE_ENV="test" y ahora es
// irrelevante: el gate es por VERCEL_ENV — ese es exactamente el punto del fix.
const OLD_ENV = { ...process.env }
afterEach(() => { process.env = { ...OLD_ENV } })

function setEnv(vercelEnv: string | undefined, jwtSecret: string | undefined) {
  delete process.env.VERCEL_ENV
  delete process.env.JWT_SECRET
  if (vercelEnv !== undefined) process.env.VERCEL_ENV = vercelEnv
  if (jwtSecret !== undefined) process.env.JWT_SECRET = jwtSecret
}

const payload = { sub: "u1", username: "dani" }

describe("gating de JWT_SECRET por VERCEL_ENV", () => {
  it("producción real sin JWT_SECRET → falla cerrado (throw)", async () => {
    setEnv("production", undefined)
    await expect(signToken(payload)).rejects.toThrow(/JWT_SECRET/)
  })

  it("preview sin JWT_SECRET → NO crashea (degrada a fallback dev)", async () => {
    setEnv("preview", undefined)
    expect(typeof (await signToken(payload))).toBe("string")
  })

  it("dev local (sin VERCEL_ENV) sin JWT_SECRET → NO crashea", async () => {
    setEnv(undefined, undefined)
    expect(typeof (await signToken(payload))).toBe("string")
  })

  it("con JWT_SECRET configurada → sign + verify round-trip", async () => {
    setEnv("production", "secreto-de-produccion-largo-1234567890-abcdef")
    const decoded = await verifyToken(await signToken(payload))
    expect(decoded.sub).toBe("u1")
    expect(decoded.username).toBe("dani")
  })

  it("token firmado con otro secreto → verify rechaza (tokens no falsificables)", async () => {
    setEnv("production", "secreto-A-1234567890-1234567890-aaaa")
    const token = await signToken(payload)
    setEnv("production", "secreto-B-distinto-0987654321-0987-bbbb")
    await expect(verifyToken(token)).rejects.toThrow()
  })
})
