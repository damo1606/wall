import { NextResponse } from "next/server"
import { supabaseServer, type TypedClient } from "@/lib/supabase"
import {
  computeAltmanZ, computeNCAV, computeNetDebt, type Financials,
} from "@/lib/financials"

export const dynamic = "force-dynamic"

// Estados financieros (EDGAR/XBRL) + derivados (Altman Z, VLN, deuda neta) de un
// símbolo. Lee edgar_financials (poblada por el cron edgar-financials) y el
// market cap del último market_snapshots. No llama a Yahoo.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params
  const ticker = symbol.toUpperCase()
  const db: TypedClient = supabaseServer()

  const { data: sym } = await db
    .from("symbols").select("id, ticker, name, sector_id, shares_outstanding")
    .eq("ticker", ticker).eq("asset_type", "stock").maybeSingle()
  if (!sym) return NextResponse.json({ error: "symbol not found" }, { status: 404 })

  // Sector → ¿financiera? Altman Z original no aplica a bancos/aseguradoras.
  let sector: string | null = null
  if (sym.sector_id) {
    const { data: sec } = await db.from("sectors").select("name").eq("id", sym.sector_id).maybeSingle()
    sector = sec?.name ?? null
  }
  const isFinancial = !!sector && /financ|bank|insur|seguro/i.test(sector)

  // Último estado financiero (FY) + market cap persistido.
  const [{ data: finRows }, { data: msRows }] = await Promise.all([
    db.from("edgar_financials").select("*")
      .eq("symbol_id", sym.id).order("period_end", { ascending: false }).limit(1),
    db.from("market_snapshots").select("market_cap")
      .eq("symbol_id", sym.id).order("taken_at", { ascending: false }).limit(1),
  ])
  const row = finRows?.[0]
  if (!row) {
    return NextResponse.json({
      ticker, company: sym.name, hasData: false,
      message: "sin estados financieros EDGAR aún (corre el cron edgar-financials)",
    })
  }
  const marketCap = msRows?.[0]?.market_cap ?? null

  const f: Financials = {
    periodEnd: row.period_end,
    fiscalPeriod: row.fiscal_period,
    form: row.form,
    totalAssets: row.total_assets,
    currentAssets: row.current_assets,
    totalLiabilities: row.total_liabilities,
    currentLiabilities: row.current_liabilities,
    retainedEarnings: row.retained_earnings,
    stockholdersEquity: row.stockholders_equity,
    cash: row.cash,
    revenue: row.revenue,
    cogs: row.cogs,
    grossProfit: row.gross_profit,
    operatingIncome: row.operating_income,
    netIncome: row.net_income,
    depAmort: row.dep_amort,
    longTermDebt: row.long_term_debt,
    shortTermDebt: row.short_term_debt,
  }

  return NextResponse.json({
    ticker,
    company: sym.name,
    hasData: true,
    periodEnd: f.periodEnd,
    form: f.form,
    lineItems: f,
    derived: {
      netDebt: computeNetDebt(f),
      ncav: computeNCAV(f, sym.shares_outstanding),
      altmanZ: computeAltmanZ(f, marketCap, { isFinancial }),
      marketCapUsed: marketCap,
      isFinancial,
    },
  })
}
