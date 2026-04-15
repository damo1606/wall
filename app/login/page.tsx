"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (res.ok) {
      sessionStorage.setItem("sore_active", "1");
      router.push("/gex");
      router.refresh();
    } else {
      const json = await res.json();
      setError(json.error ?? "Error al iniciar sesión");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-accent font-bold text-3xl tracking-[0.3em] mb-1">SORE</div>
          <div className="text-muted text-xs tracking-widest">INSTITUTIONAL OPTIONS FLOW</div>
        </div>

        <form onSubmit={handleSubmit} className="border border-border bg-surface p-8 flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-muted tracking-widest font-bold">USUARIO</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="bg-bg border border-border text-text px-3 py-2 text-sm tracking-widest focus:outline-none focus:border-accent transition-colors"
              placeholder="usuario"
              autoComplete="username"
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-muted tracking-widest font-bold">CONTRASEÑA</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-bg border border-border text-text px-3 py-2 text-sm tracking-widest focus:outline-none focus:border-accent transition-colors"
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div className="text-red-500 text-xs tracking-widest text-center">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-accent text-white py-2 text-sm font-bold tracking-widest hover:opacity-80 disabled:opacity-40 transition-opacity mt-1"
          >
            {loading ? "..." : "INGRESAR"}
          </button>
        </form>
      </div>
    </div>
  );
}
