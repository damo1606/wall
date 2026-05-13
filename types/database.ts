export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alert_triggers: {
        Row: {
          alert_id: string
          delivered: boolean
          delivery_attempts: number
          fired_at: string
          id: string
          payload: Json | null
        }
        Insert: {
          alert_id: string
          delivered?: boolean
          delivery_attempts?: number
          fired_at?: string
          id?: string
          payload?: Json | null
        }
        Update: {
          alert_id?: string
          delivered?: boolean
          delivery_attempts?: number
          fired_at?: string
          id?: string
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "alert_triggers_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          channel: string
          condition: string
          created_at: string
          id: string
          is_active: boolean
          symbol_id: string | null
          threshold: Json
          user_id: string
        }
        Insert: {
          channel?: string
          condition: string
          created_at?: string
          id?: string
          is_active?: boolean
          symbol_id?: string | null
          threshold: Json
          user_id: string
        }
        Update: {
          channel?: string
          condition?: string
          created_at?: string
          id?: string
          is_active?: boolean
          symbol_id?: string | null
          threshold?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_symbol_id_fkey"
            columns: ["symbol_id"]
            isOneToOne: false
            referencedRelation: "symbols"
            referencedColumns: ["id"]
          },
        ]
      }
      api_usage_log: {
        Row: {
          called_at: string
          cron_run_id: string | null
          endpoint: string
          id: string
          latency_ms: number | null
          provider: string
          status_code: number | null
        }
        Insert: {
          called_at?: string
          cron_run_id?: string | null
          endpoint: string
          id?: string
          latency_ms?: number | null
          provider: string
          status_code?: number | null
        }
        Update: {
          called_at?: string
          cron_run_id?: string | null
          endpoint?: string
          id?: string
          latency_ms?: number | null
          provider?: string
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_log_cron_run_id_fkey"
            columns: ["cron_run_id"]
            isOneToOne: false
            referencedRelation: "cron_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      backtest_runs: {
        Row: {
          cagr: number | null
          config: Json | null
          created_at: string
          end_date: string | null
          id: string
          max_dd: number | null
          sharpe: number | null
          start_date: string | null
          strategy_name: string
          trades_count: number | null
          user_id: string
        }
        Insert: {
          cagr?: number | null
          config?: Json | null
          created_at?: string
          end_date?: string | null
          id?: string
          max_dd?: number | null
          sharpe?: number | null
          start_date?: string | null
          strategy_name: string
          trades_count?: number | null
          user_id: string
        }
        Update: {
          cagr?: number | null
          config?: Json | null
          created_at?: string
          end_date?: string | null
          id?: string
          max_dd?: number | null
          sharpe?: number | null
          start_date?: string | null
          strategy_name?: string
          trades_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      company_profile: {
        Row: {
          ceo: string | null
          description: string | null
          employees: number | null
          founded: number | null
          hq_country: string | null
          symbol_id: string
          updated_at: string
          website: string | null
        }
        Insert: {
          ceo?: string | null
          description?: string | null
          employees?: number | null
          founded?: number | null
          hq_country?: string | null
          symbol_id: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          ceo?: string | null
          description?: string | null
          employees?: number | null
          founded?: number | null
          hq_country?: string | null
          symbol_id?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_profile_symbol_id_fkey"
            columns: ["symbol_id"]
            isOneToOne: true
            referencedRelation: "symbols"
            referencedColumns: ["id"]
          },
        ]
      }
      cot_reports: {
        Row: {
          commercial_long: number | null
          commercial_short: number | null
          contract_code: string
          cron_run_id: string | null
          id: string
          non_commercial_long: number | null
          non_commercial_short: number | null
          open_interest: number | null
          report_date: string
        }
        Insert: {
          commercial_long?: number | null
          commercial_short?: number | null
          contract_code: string
          cron_run_id?: string | null
          id?: string
          non_commercial_long?: number | null
          non_commercial_short?: number | null
          open_interest?: number | null
          report_date: string
        }
        Update: {
          commercial_long?: number | null
          commercial_short?: number | null
          contract_code?: string
          cron_run_id?: string | null
          id?: string
          non_commercial_long?: number | null
          non_commercial_short?: number | null
          open_interest?: number | null
          report_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "cot_reports_cron_run_id_fkey"
            columns: ["cron_run_id"]
            isOneToOne: false
            referencedRelation: "cron_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_runs: {
        Row: {
          duration_ms: number | null
          error_summary: string | null
          finished_at: string | null
          id: string
          job_name: string
          rows_failed: number
          rows_inserted: number
          started_at: string
          status: string
        }
        Insert: {
          duration_ms?: number | null
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          job_name: string
          rows_failed?: number
          rows_inserted?: number
          started_at?: string
          status?: string
        }
        Update: {
          duration_ms?: number | null
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          job_name?: string
          rows_failed?: number
          rows_inserted?: number
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      cycle_classifications: {
        Row: {
          confidence: number | null
          cron_run_id: string | null
          id: string
          regime: string
          signals: Json | null
          taken_at: string
        }
        Insert: {
          confidence?: number | null
          cron_run_id?: string | null
          id?: string
          regime: string
          signals?: Json | null
          taken_at?: string
        }
        Update: {
          confidence?: number | null
          cron_run_id?: string | null
          id?: string
          regime?: string
          signals?: Json | null
          taken_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cycle_classifications_cron_run_id_fkey"
            columns: ["cron_run_id"]
            isOneToOne: false
            referencedRelation: "cron_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      data_quality_log: {
        Row: {
          actual: Json | null
          check_name: string
          created_at: string
          cron_run_id: string | null
          expected: Json | null
          id: string
          severity: string
          symbol_id: string | null
        }
        Insert: {
          actual?: Json | null
          check_name: string
          created_at?: string
          cron_run_id?: string | null
          expected?: Json | null
          id?: string
          severity: string
          symbol_id?: string | null
        }
        Update: {
          actual?: Json | null
          check_name?: string
          created_at?: string
          cron_run_id?: string | null
          expected?: Json | null
          id?: string
          severity?: string
          symbol_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_quality_log_cron_run_id_fkey"
            columns: ["cron_run_id"]
            isOneToOne: false
            referencedRelation: "cron_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_quality_log_symbol_id_fkey"
            columns: ["symbol_id"]
            isOneToOne: false
            referencedRelation: "symbols"
            referencedColumns: ["id"]
          },
        ]
      }
      diario_entries: {
        Row: {
          attachments: Json | null
          conviction: number | null
          created_at: string
          entry_date: string
          id: string
          linked_signal_id: string | null
          sentiment: number | null
          symbol_id: string | null
          thesis: string | null
          user_id: string
        }
        Insert: {
          attachments?: Json | null
          conviction?: number | null
          created_at?: string
          entry_date?: string
          id?: string
          linked_signal_id?: string | null
          sentiment?: number | null
          symbol_id?: string | null
          thesis?: string | null
          user_id: string
        }
        Update: {
          attachments?: Json | null
          conviction?: number | null
          created_at?: string
          entry_date?: string
          id?: string
          linked_signal_id?: string | null
          sentiment?: number | null
          symbol_id?: string | null
          thesis?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diario_entries_linked_signal_id_fkey"
            columns: ["linked_signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diario_entries_symbol_id_fkey"
            columns: ["symbol_id"]
            isOneToOne: false
            referencedRelation: "symbols"
            referencedColumns: ["id"]
          },
        ]
      }
      foda_analyses: {
        Row: {
          generated_at: string
          id: string
          opportunities: Json | null
          source: string
          strengths: Json | null
          symbol_id: string
          threats: Json | null
          weaknesses: Json | null
        }
        Insert: {
          generated_at?: string
          id?: string
          opportunities?: Json | null
          source?: string
          strengths?: Json | null
          symbol_id: string
          threats?: Json | null
          weaknesses?: Json | null
        }
        Update: {
          generated_at?: string
          id?: string
          opportunities?: Json | null
          source?: string
          strengths?: Json | null
          symbol_id?: string
          threats?: Json | null
          weaknesses?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "foda_analyses_symbol_id_fkey"
            columns: ["symbol_id"]
            isOneToOne: false
            referencedRelation: "symbols"
            referencedColumns: ["id"]
          },
        ]
      }
      fred_observations: {
        Row: {
          cron_run_id: string | null
          fetched_at: string
          id: string
          obs_date: string
          series_id: string
          value: number | null
        }
        Insert: {
          cron_run_id?: string | null
          fetched_at?: string
          id?: string
          obs_date: string
          series_id: string
          value?: number | null
        }
        Update: {
          cron_run_id?: string | null
          fetched_at?: string
          id?: string
          obs_date?: string
          series_id?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fred_observations_cron_run_id_fkey"
            columns: ["cron_run_id"]
            isOneToOne: false
            referencedRelation: "cron_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fred_observations_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "fred_series"
            referencedColumns: ["id"]
          },
        ]
      }
      fred_series: {
        Row: {
          category: string | null
          created_at: string
          frequency: string | null
          id: string
          name: string | null
          series_id: string
          units: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          frequency?: string | null
          id?: string
          name?: string | null
          series_id: string
          units?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          frequency?: string | null
          id?: string
          name?: string | null
          series_id?: string
          units?: string | null
        }
        Relationships: []
      }
      fundamentals_snapshots: {
        Row: {
          beta: number | null
          cron_run_id: string | null
          debt_to_equity: number | null
          dividend_yield: number | null
          eps_ttm: number | null
          ev_ebitda: number | null
          fcf_yield: number | null
          id: string
          iv_30d: number | null
          market_cap: number | null
          payout_ratio: number | null
          pb: number | null
          pe: number | null
          price: number | null
          revenue_ttm: number | null
          roe: number | null
          roic: number | null
          source: string
          symbol_id: string
          taken_at: string
        }
        Insert: {
          beta?: number | null
          cron_run_id?: string | null
          debt_to_equity?: number | null
          dividend_yield?: number | null
          eps_ttm?: number | null
          ev_ebitda?: number | null
          fcf_yield?: number | null
          id?: string
          iv_30d?: number | null
          market_cap?: number | null
          payout_ratio?: number | null
          pb?: number | null
          pe?: number | null
          price?: number | null
          revenue_ttm?: number | null
          roe?: number | null
          roic?: number | null
          source?: string
          symbol_id: string
          taken_at?: string
        }
        Update: {
          beta?: number | null
          cron_run_id?: string | null
          debt_to_equity?: number | null
          dividend_yield?: number | null
          eps_ttm?: number | null
          ev_ebitda?: number | null
          fcf_yield?: number | null
          id?: string
          iv_30d?: number | null
          market_cap?: number | null
          payout_ratio?: number | null
          pb?: number | null
          pe?: number | null
          price?: number | null
          revenue_ttm?: number | null
          roe?: number | null
          roic?: number | null
          source?: string
          symbol_id?: string
          taken_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fundamentals_snapshots_cron_run_id_fkey"
            columns: ["cron_run_id"]
            isOneToOne: false
            referencedRelation: "cron_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fundamentals_snapshots_symbol_id_fkey"
            columns: ["symbol_id"]
            isOneToOne: false
            referencedRelation: "symbols"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rates: {
        Row: {
          base: string
          cron_run_id: string | null
          id: string
          quote: string
          rate: number
          taken_at: string
        }
        Insert: {
          base: string
          cron_run_id?: string | null
          id?: string
          quote: string
          rate: number
          taken_at?: string
        }
        Update: {
          base?: string
          cron_run_id?: string | null
          id?: string
          quote?: string
          rate?: number
          taken_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fx_rates_cron_run_id_fkey"
            columns: ["cron_run_id"]
            isOneToOne: false
            referencedRelation: "cron_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      gamma_map: {
        Row: {
          call_gex: number | null
          cron_run_id: string | null
          expiration: string
          id: string
          net_gex: number | null
          put_gex: number | null
          strike: number
          symbol_id: string
          taken_at: string
        }
        Insert: {
          call_gex?: number | null
          cron_run_id?: string | null
          expiration: string
          id?: string
          net_gex?: number | null
          put_gex?: number | null
          strike: number
          symbol_id: string
          taken_at?: string
        }
        Update: {
          call_gex?: number | null
          cron_run_id?: string | null
          expiration?: string
          id?: string
          net_gex?: number | null
          put_gex?: number | null
          strike?: number
          symbol_id?: string
          taken_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gamma_map_cron_run_id_fkey"
            columns: ["cron_run_id"]
            isOneToOne: false
            referencedRelation: "cron_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gamma_map_symbol_id_fkey"
            columns: ["symbol_id"]
            isOneToOne: false
            referencedRelation: "symbols"
            referencedColumns: ["id"]
          },
        ]
      }
      gex_snapshots: {
        Row: {
          call_gamma: number | null
          cron_run_id: string | null
          dealer_position: number | null
          flip_point: number | null
          id: string
          put_gamma: number | null
          spot_price: number | null
          symbol_id: string
          taken_at: string
          total_gamma: number | null
          zero_gamma: number | null
        }
        Insert: {
          call_gamma?: number | null
          cron_run_id?: string | null
          dealer_position?: number | null
          flip_point?: number | null
          id?: string
          put_gamma?: number | null
          spot_price?: number | null
          symbol_id: string
          taken_at?: string
          total_gamma?: number | null
          zero_gamma?: number | null
        }
        Update: {
          call_gamma?: number | null
          cron_run_id?: string | null
          dealer_position?: number | null
          flip_point?: number | null
          id?: string
          put_gamma?: number | null
          spot_price?: number | null
          symbol_id?: string
          taken_at?: string
          total_gamma?: number | null
          zero_gamma?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gex_snapshots_cron_run_id_fkey"
            columns: ["cron_run_id"]
            isOneToOne: false
            referencedRelation: "cron_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gex_snapshots_symbol_id_fkey"
            columns: ["symbol_id"]
            isOneToOne: false
            referencedRelation: "symbols"
            referencedColumns: ["id"]
          },
        ]
      }
      methodology_snapshots: {
        Row: {
          cron_run_id: string | null
          id: string
          methodology: string
          payload: Json
          symbol_id: string | null
          taken_at: string
        }
        Insert: {
          cron_run_id?: string | null
          id?: string
          methodology: string
          payload: Json
          symbol_id?: string | null
          taken_at?: string
        }
        Update: {
          cron_run_id?: string | null
          id?: string
          methodology?: string
          payload?: Json
          symbol_id?: string | null
          taken_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "methodology_snapshots_cron_run_id_fkey"
            columns: ["cron_run_id"]
            isOneToOne: false
            referencedRelation: "cron_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "methodology_snapshots_symbol_id_fkey"
            columns: ["symbol_id"]
            isOneToOne: false
            referencedRelation: "symbols"
            referencedColumns: ["id"]
          },
        ]
      }
      news_cache: {
        Row: {
          fetched_at: string
          headline: string
          id: string
          published_at: string | null
          sentiment: number | null
          source: string | null
          summary: string | null
          symbol_id: string | null
          url: string | null
        }
        Insert: {
          fetched_at?: string
          headline: string
          id?: string
          published_at?: string | null
          sentiment?: number | null
          source?: string | null
          summary?: string | null
          symbol_id?: string | null
          url?: string | null
        }
        Update: {
          fetched_at?: string
          headline?: string
          id?: string
          published_at?: string | null
          sentiment?: number | null
          source?: string | null
          summary?: string | null
          symbol_id?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "news_cache_symbol_id_fkey"
            columns: ["symbol_id"]
            isOneToOne: false
            referencedRelation: "symbols"
            referencedColumns: ["id"]
          },
        ]
      }
      option_chains: {
        Row: {
          ask: number | null
          bid: number | null
          cron_run_id: string | null
          delta: number | null
          expiration: string
          gamma: number | null
          id: string
          iv: number | null
          last: number | null
          open_interest: number | null
          option_type: string
          strike: number
          symbol_id: string
          taken_at: string
          theta: number | null
          vega: number | null
          volume: number | null
        }
        Insert: {
          ask?: number | null
          bid?: number | null
          cron_run_id?: string | null
          delta?: number | null
          expiration: string
          gamma?: number | null
          id?: string
          iv?: number | null
          last?: number | null
          open_interest?: number | null
          option_type: string
          strike: number
          symbol_id: string
          taken_at?: string
          theta?: number | null
          vega?: number | null
          volume?: number | null
        }
        Update: {
          ask?: number | null
          bid?: number | null
          cron_run_id?: string | null
          delta?: number | null
          expiration?: string
          gamma?: number | null
          id?: string
          iv?: number | null
          last?: number | null
          open_interest?: number | null
          option_type?: string
          strike?: number
          symbol_id?: string
          taken_at?: string
          theta?: number | null
          vega?: number | null
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "option_chains_cron_run_id_fkey"
            columns: ["cron_run_id"]
            isOneToOne: false
            referencedRelation: "cron_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "option_chains_symbol_id_fkey"
            columns: ["symbol_id"]
            isOneToOne: false
            referencedRelation: "symbols"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolios: {
        Row: {
          base_currency: string
          broker: string | null
          created_at: string
          id: string
          name: string
          type: string
          user_id: string
        }
        Insert: {
          base_currency?: string
          broker?: string | null
          created_at?: string
          id?: string
          name: string
          type?: string
          user_id: string
        }
        Update: {
          base_currency?: string
          broker?: string | null
          created_at?: string
          id?: string
          name?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          avg_cost: number | null
          id: string
          last_updated_at: string
          opened_at: string | null
          portfolio_id: string
          qty: number
          symbol_id: string
        }
        Insert: {
          avg_cost?: number | null
          id?: string
          last_updated_at?: string
          opened_at?: string | null
          portfolio_id: string
          qty?: number
          symbol_id: string
        }
        Update: {
          avg_cost?: number | null
          id?: string
          last_updated_at?: string
          opened_at?: string | null
          portfolio_id?: string
          qty?: number
          symbol_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_symbol_id_fkey"
            columns: ["symbol_id"]
            isOneToOne: false
            referencedRelation: "symbols"
            referencedColumns: ["id"]
          },
        ]
      }
      prospectiva_theses: {
        Row: {
          closed_at: string | null
          conviction: number | null
          entry_thesis: string | null
          horizon_days: number | null
          id: string
          opened_at: string
          outcome: string | null
          realized_return: number | null
          symbol_id: string
          target_price: number | null
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          conviction?: number | null
          entry_thesis?: string | null
          horizon_days?: number | null
          id?: string
          opened_at?: string
          outcome?: string | null
          realized_return?: number | null
          symbol_id: string
          target_price?: number | null
          user_id: string
        }
        Update: {
          closed_at?: string | null
          conviction?: number | null
          entry_thesis?: string | null
          horizon_days?: number | null
          id?: string
          opened_at?: string
          outcome?: string | null
          realized_return?: number | null
          symbol_id?: string
          target_price?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospectiva_theses_symbol_id_fkey"
            columns: ["symbol_id"]
            isOneToOne: false
            referencedRelation: "symbols"
            referencedColumns: ["id"]
          },
        ]
      }
      rotation_signals: {
        Row: {
          cron_run_id: string | null
          from_sector_id: string | null
          id: string
          strength: number | null
          taken_at: string
          to_sector_id: string | null
        }
        Insert: {
          cron_run_id?: string | null
          from_sector_id?: string | null
          id?: string
          strength?: number | null
          taken_at?: string
          to_sector_id?: string | null
        }
        Update: {
          cron_run_id?: string | null
          from_sector_id?: string | null
          id?: string
          strength?: number | null
          taken_at?: string
          to_sector_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rotation_signals_cron_run_id_fkey"
            columns: ["cron_run_id"]
            isOneToOne: false
            referencedRelation: "cron_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotation_signals_from_sector_id_fkey"
            columns: ["from_sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotation_signals_to_sector_id_fkey"
            columns: ["to_sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      scanner_results: {
        Row: {
          cron_run_id: string | null
          id: string
          metrics: Json | null
          scan_type: string
          score: number | null
          symbol_id: string
          taken_at: string
        }
        Insert: {
          cron_run_id?: string | null
          id?: string
          metrics?: Json | null
          scan_type: string
          score?: number | null
          symbol_id: string
          taken_at?: string
        }
        Update: {
          cron_run_id?: string | null
          id?: string
          metrics?: Json | null
          scan_type?: string
          score?: number | null
          symbol_id?: string
          taken_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scanner_results_cron_run_id_fkey"
            columns: ["cron_run_id"]
            isOneToOne: false
            referencedRelation: "cron_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scanner_results_symbol_id_fkey"
            columns: ["symbol_id"]
            isOneToOne: false
            referencedRelation: "symbols"
            referencedColumns: ["id"]
          },
        ]
      }
      sector_scores: {
        Row: {
          cron_run_id: string | null
          id: string
          momentum: number | null
          score: number | null
          sector_id: string
          taken_at: string
          valuation: number | null
        }
        Insert: {
          cron_run_id?: string | null
          id?: string
          momentum?: number | null
          score?: number | null
          sector_id: string
          taken_at?: string
          valuation?: number | null
        }
        Update: {
          cron_run_id?: string | null
          id?: string
          momentum?: number | null
          score?: number | null
          sector_id?: string
          taken_at?: string
          valuation?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sector_scores_cron_run_id_fkey"
            columns: ["cron_run_id"]
            isOneToOne: false
            referencedRelation: "cron_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sector_scores_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      sectors: {
        Row: {
          created_at: string
          etf_proxy_symbol_id: string | null
          gics_code: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          etf_proxy_symbol_id?: string | null
          gics_code?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          etf_proxy_symbol_id?: string | null
          gics_code?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "sectors_etf_proxy_fk"
            columns: ["etf_proxy_symbol_id"]
            isOneToOne: false
            referencedRelation: "symbols"
            referencedColumns: ["id"]
          },
        ]
      }
      signals: {
        Row: {
          closed_at: string | null
          cron_run_id: string | null
          direction: string
          expires_at: string | null
          id: string
          outcome_return: number | null
          rationale: Json | null
          signal_type: string
          strength: number
          symbol_id: string
          triggered_at: string
        }
        Insert: {
          closed_at?: string | null
          cron_run_id?: string | null
          direction: string
          expires_at?: string | null
          id?: string
          outcome_return?: number | null
          rationale?: Json | null
          signal_type: string
          strength: number
          symbol_id: string
          triggered_at?: string
        }
        Update: {
          closed_at?: string | null
          cron_run_id?: string | null
          direction?: string
          expires_at?: string | null
          id?: string
          outcome_return?: number | null
          rationale?: Json | null
          signal_type?: string
          strength?: number
          symbol_id?: string
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "signals_cron_run_id_fkey"
            columns: ["cron_run_id"]
            isOneToOne: false
            referencedRelation: "cron_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signals_symbol_id_fkey"
            columns: ["symbol_id"]
            isOneToOne: false
            referencedRelation: "symbols"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_chain_links: {
        Row: {
          as_of: string | null
          concentration_pct: number | null
          id: string
          partner_symbol_id: string | null
          relation: string
          source: string | null
          symbol_id: string
        }
        Insert: {
          as_of?: string | null
          concentration_pct?: number | null
          id?: string
          partner_symbol_id?: string | null
          relation: string
          source?: string | null
          symbol_id: string
        }
        Update: {
          as_of?: string | null
          concentration_pct?: number | null
          id?: string
          partner_symbol_id?: string | null
          relation?: string
          source?: string | null
          symbol_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supply_chain_links_partner_symbol_id_fkey"
            columns: ["partner_symbol_id"]
            isOneToOne: false
            referencedRelation: "symbols"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_chain_links_symbol_id_fkey"
            columns: ["symbol_id"]
            isOneToOne: false
            referencedRelation: "symbols"
            referencedColumns: ["id"]
          },
        ]
      }
      support_resistance_levels: {
        Row: {
          id: string
          level_price: number
          level_type: string
          source: string
          strength: number | null
          symbol_id: string
          taken_at: string
        }
        Insert: {
          id?: string
          level_price: number
          level_type: string
          source: string
          strength?: number | null
          symbol_id: string
          taken_at?: string
        }
        Update: {
          id?: string
          level_price?: number
          level_type?: string
          source?: string
          strength?: number | null
          symbol_id?: string
          taken_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_resistance_levels_symbol_id_fkey"
            columns: ["symbol_id"]
            isOneToOne: false
            referencedRelation: "symbols"
            referencedColumns: ["id"]
          },
        ]
      }
      symbols: {
        Row: {
          asset_type: string
          created_at: string
          delisted_at: string | null
          exchange: string | null
          id: string
          industry: string | null
          is_active: boolean
          name: string
          sector_id: string | null
          ticker: string
          updated_at: string
        }
        Insert: {
          asset_type?: string
          created_at?: string
          delisted_at?: string | null
          exchange?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean
          name: string
          sector_id?: string | null
          ticker: string
          updated_at?: string
        }
        Update: {
          asset_type?: string
          created_at?: string
          delisted_at?: string | null
          exchange?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean
          name?: string
          sector_id?: string | null
          ticker?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "symbols_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      track_record: {
        Row: {
          alpha_pct: number | null
          benchmark_return_pct: number | null
          created_at: string
          entry_date: string
          entry_price: number | null
          exit_date: string | null
          exit_price: number | null
          horizon_days: number | null
          id: string
          methodology: string | null
          notes: string | null
          return_pct: number | null
          signal_id: string | null
          symbol_id: string
          thesis_id: string | null
          user_id: string | null
        }
        Insert: {
          alpha_pct?: number | null
          benchmark_return_pct?: number | null
          created_at?: string
          entry_date: string
          entry_price?: number | null
          exit_date?: string | null
          exit_price?: number | null
          horizon_days?: number | null
          id?: string
          methodology?: string | null
          notes?: string | null
          return_pct?: number | null
          signal_id?: string | null
          symbol_id: string
          thesis_id?: string | null
          user_id?: string | null
        }
        Update: {
          alpha_pct?: number | null
          benchmark_return_pct?: number | null
          created_at?: string
          entry_date?: string
          entry_price?: number | null
          exit_date?: string | null
          exit_price?: number | null
          horizon_days?: number | null
          id?: string
          methodology?: string | null
          notes?: string | null
          return_pct?: number | null
          signal_id?: string | null
          symbol_id?: string
          thesis_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "track_record_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "track_record_symbol_id_fkey"
            columns: ["symbol_id"]
            isOneToOne: false
            referencedRelation: "symbols"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "track_record_thesis_id_fkey"
            columns: ["thesis_id"]
            isOneToOne: false
            referencedRelation: "prospectiva_theses"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          executed_at: string
          fee: number
          id: string
          notes: string | null
          portfolio_id: string
          price: number | null
          qty: number
          symbol_id: string
          tx_type: string
        }
        Insert: {
          executed_at?: string
          fee?: number
          id?: string
          notes?: string | null
          portfolio_id: string
          price?: number | null
          qty: number
          symbol_id: string
          tx_type: string
        }
        Update: {
          executed_at?: string
          fee?: number
          id?: string
          notes?: string | null
          portfolio_id?: string
          price?: number | null
          qty?: number
          symbol_id?: string
          tx_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_symbol_id_fkey"
            columns: ["symbol_id"]
            isOneToOne: false
            referencedRelation: "symbols"
            referencedColumns: ["id"]
          },
        ]
      }
      users_profile: {
        Row: {
          base_currency: string
          created_at: string
          default_horizon_days: number
          display_name: string | null
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          base_currency?: string
          created_at?: string
          default_horizon_days?: number
          display_name?: string | null
          tier?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          base_currency?: string
          created_at?: string
          default_horizon_days?: number
          display_name?: string | null
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      valuation_scores: {
        Row: {
          components: Json | null
          cron_run_id: string | null
          id: string
          methodology: string
          score: number
          symbol_id: string
          taken_at: string
        }
        Insert: {
          components?: Json | null
          cron_run_id?: string | null
          id?: string
          methodology: string
          score: number
          symbol_id: string
          taken_at?: string
        }
        Update: {
          components?: Json | null
          cron_run_id?: string | null
          id?: string
          methodology?: string
          score?: number
          symbol_id?: string
          taken_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "valuation_scores_cron_run_id_fkey"
            columns: ["cron_run_id"]
            isOneToOne: false
            referencedRelation: "cron_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valuation_scores_symbol_id_fkey"
            columns: ["symbol_id"]
            isOneToOne: false
            referencedRelation: "symbols"
            referencedColumns: ["id"]
          },
        ]
      }
      value_chain_segments: {
        Row: {
          as_of: string | null
          id: string
          margin_pct: number | null
          position: string
          segment_name: string
          symbol_id: string
        }
        Insert: {
          as_of?: string | null
          id?: string
          margin_pct?: number | null
          position: string
          segment_name: string
          symbol_id: string
        }
        Update: {
          as_of?: string | null
          id?: string
          margin_pct?: number | null
          position?: string
          segment_name?: string
          symbol_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "value_chain_segments_symbol_id_fkey"
            columns: ["symbol_id"]
            isOneToOne: false
            referencedRelation: "symbols"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist: {
        Row: {
          added_at: string
          id: string
          notes: string | null
          symbol_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          notes?: string | null
          symbol_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          id?: string
          notes?: string | null
          symbol_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_symbol_id_fkey"
            columns: ["symbol_id"]
            isOneToOne: false
            referencedRelation: "symbols"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      data_quality_daily: {
        Row: {
          api_calls: number | null
          api_errors: number | null
          avg_duration_ms: number | null
          day: string | null
          dq_errors: number | null
          job_name: string | null
          rows_failed: number | null
          rows_inserted: number | null
          runs: number | null
          runs_failed: number | null
          runs_partial: number | null
          runs_success: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
