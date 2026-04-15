export interface Levels {
  callWall: number;
  putWall: number;
  gammaFlip: number;
  support: number;
  resistance: number;
}

export interface GexPoint {
  strike: number;
  gex: number;
}

export interface VannaPoint {
  strike: number;
  vanna: number;
}

export interface StrikeData {
  strike: number;
  callOI: number;
  putOI: number;
  gexCall: number;
  gexPut: number;
  totalGEX: number;
  pcr: number;
  zGex: number;
  zPcr: number;
  institutionalPressure: number;
}

export interface Analysis2Result {
  ticker: string;
  spot: number;
  expiration: string;
  availableExpirations: string[];
  support: number;
  resistance: number;
  filteredStrikes: StrikeData[];
}

export interface AggStrikeData {
  strike: number;
  totalGEX: number;
  totalOI: number;
  weightedPCR: number;
  expirationCount: number;
  zGex: number;
  zOI: number;
  zPcr: number;
  confluenceScore: number;
}

export interface Analysis3Result {
  ticker: string;
  spot: number;
  expiration: string;
  availableExpirations: string[];
  expirationsUsed: string[];
  support: number;
  resistance: number;
  supportConfidence: number;
  resistanceConfidence: number;
  filteredStrikes: AggStrikeData[];
}

export interface AnalysisResult {
  ticker: string;
  spot: number;
  expiration: string;
  availableExpirations: string[];
  levels: Levels;
  gexProfile: GexPoint[];
  vannaProfile: VannaPoint[];
  dealerFlow: {
    prices: number[];
    flows: number[];
  };
  putCallRatio: number;
  institutionalPressure: number;
  netGex: number;
}
