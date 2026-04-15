// Dow Jones Industrial Average — 30 componentes
export const DJIA_SYMBOLS = [
  "AAPL","AMGN","AMZN","AXP","BA","CAT","CRM","CSCO","CVX","DIS",
  "DOW","GS","HD","HON","IBM","JNJ","JPM","KO","MCD","MRK",
  "MSFT","NKE","NVDA","PG","SHW","TRV","UNH","V","VZ","WMT",
]

// S&P 500 — top 200 por capitalización
export const SP500_SYMBOLS = [
  "AAPL","MSFT","NVDA","AMZN","META","GOOGL","GOOG","BRK.B","LLY","AVGO",
  "JPM","TSLA","UNH","XOM","V","MA","COST","HD","JNJ","PG",
  "ABBV","NFLX","BAC","CRM","WMT","CVX","MRK","ORCL","ADBE","KO",
  "AMD","WFC","PEP","TMO","ACN","LIN","MCD","PM","IBM","ABT",
  "CSCO","DHR","GE","CAT","INTU","ISRG","TXN","AMGN","SPGI","GS",
  "QCOM","RTX","NEE","VZ","HON","BLK","T","LOW","SYK","BKNG",
  "MS","AMAT","AXP","PLD","ELV","GILD","UNP","BMY","DE","LRCX",
  "MDT","VRTX","PGR","REGN","ADI","ETN","SCHW","CB","MU","C",
  "CI","TJX","SO","SBUX","MMC","SHW","KLAC","DUK","CL","CME",
  "EOG","BDX","ZTS","ICE","MCO","APH","NOC","PH","ITW","USB",
  "TGT","FI","HCA","EMR","MAR","COF","FCX","WM","CEG","AON",
  "GD","PSA","MO","NSC","AIG","SRE","AJG","TT","ROP","OKE",
  "ECL","WELL","AME","F","GM","DLR","EW","FDX","MPC","TDG",
  "AFL","KMB","HLT","CARR","ORLY","PCAR","ALL","ROST","HES","CTAS",
  "NUE","OTIS","PPG","STZ","JCI","PAYX","MNST","AEP","DVN","HSY",
  "GWW","DOW","DD","VLO","HAL","O","RSG","CHTR","FTNT","IDXX",
  "EXC","ED","WEC","KEYS","XEL","AWK","MTD","ROK","FAST","BRO",
  "IR","VRSK","GPN","EFX","CTSH","CINF","CDW","TROW","IQV","WAT",
  "BAX","K","RMD","LHX","ANSS","STE","DLTR","WY","DTE","CHD",
]

// Nasdaq 100 — empresas no financieras del Nasdaq
export const NASDAQ100_SYMBOLS = [
  "AAPL","MSFT","NVDA","AMZN","META","GOOGL","GOOG","AVGO","TSLA","COST",
  "NFLX","AMD","ASML","QCOM","INTU","CSCO","TXN","LIN","ISRG","AMAT",
  "REGN","VRTX","AMGN","MU","ADI","KLAC","LRCX","PANW","MRVL","CDNS",
  "SNPS","CRWD","FTNT","MCHP","ADSK","PCAR","CTAS","PAYX","FAST","ROST",
  "VRSK","IDXX","DXCM","BIIB","GILD","MNST","KDP","PEP","DLTR","EBAY",
  "SBUX","MDLZ","EA","TTWO","NXPI","ANSS","SWKS","CTSH","GEHC","ON",
  "BKR","ZS","DDOG","ILMN","MRNA","TEAM","WDAY","OKTA","ABNB","DASH",
  "COIN","MELI","PDD","BIDU","JD","NTES","WBD","PARA","SIRI","LCID",
]

// Russell 2000 — small caps de calidad curadas por sector
export const RUSSELL2000_SYMBOLS = [
  // Technology
  "SLAB","MGNI","CERT","TASK","POWI","CALX","PRGS","BAND",
  // Healthcare
  "TMDX","ACAD","ITCI","RCUS","IMVT","VERA","COLL","PAHC","ADUS","INVA",
  // Financials
  "WSFS","WAFD","NBTB","SFNC","HONE","FBIZ",
  // Consumer Discretionary
  "BOOT","CVCO","GENI","LESL","CATO",
  // Consumer Staples
  "CENT","SMPL","JBSS","SPTN",
  // Industrials
  "KFRC","PRIM","MTRX","HY","DXPE","HAYW",
  // Energy
  "MGY","TALO","SM","VTLE",
  // Materials
  "AZEK","DOOR",
  // Real Estate
  "GMRE","NXRT","ILPT","FCPT",
]

// Quantum / DeepTech — empresas de frontera tecnológica (micro/small cap)
export const QUANTUM_SYMBOLS = [
  "IONQ","QBTS","QUBT","RGTI","ARQQ",   // Quantum computing
  "RKLB","ACHR","JOBY",                  // Space & eVTOL
  "PL","SPIR",                           // Satellite data
  "SOUN","BBAI",                         // AI/Voice infra
  "OUST","INVZ","AEVA",                  // LiDAR / autonomous
  "FORM","CEVA",                         // Semiconductores especializados
]

// Biotech Small Cap — desarrollo clínico y especialidades médicas
export const BIOTECH_SMALL_SYMBOLS = [
  "PCVX","DNLI","FATE","MRUS","PTCT",
  "KRYS","RCKT","VCEL","RYTM","RVMD",
  "APLS","ITOS","STRO","PRME","EDIT",
  "NTLA","CRSP","BLUE","ACRS","NBTX",
]

// Tech Small Cap — SaaS, semiconductor y cloud de mediana escala
export const TECH_SMALL_SYMBOLS = [
  "SPSC","HLIT","SEMR","QLYS","ALRM",
  "WEAV","FSLY","JAMF","PAYO","LSPD",
  "DOCN","NCNO","ASAN","ACMR","GTLB",
  "FOUR","SLAB",
]

// Consumo Básico Small Cap — alimentos, bebidas y CPG de nicho
export const CONSUMER_SMALL_SYMBOLS = [
  "HAIN","MGPI","LWAY","VITL","NOMD",
  "DNUT","PRPL","BARK","HNGR","ANDE",
  "VLGEA","CENT","FRPT","SMPL",
]

// Russell 1000 — adicionales al S&P 500 (small/mid cap de calidad)
export const RUSSELL_SYMBOLS = [
  "AXON","HUBS","APP","ENPH","MPWR","ENTG","PODD","TRMB","ALGN","LULU",
  "RMD","WSM","DECK","DOCS","EXAS","CSGP","VRT","CELH","DUOL","NTRA",
  "MASI","ICLR","TECH","BRKR","WST","NVCR","EXEL","INSP","PRCT","STVN",
  "MLAB","QDEL","NEOG","RXRX","BEAM","ITCI","TGTX","ACAD","SEER","LEGN",
  "TMDX","ALLO","KROS","IMVT","ARVN","KYMR","VRTX","FOLD","PTGX","RCUS",
]
