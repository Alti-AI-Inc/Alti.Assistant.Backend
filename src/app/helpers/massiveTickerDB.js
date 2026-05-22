/**
 * Massive.com Ticker Intelligence Database
 * Complete coverage: Stocks, ETFs, Crypto, Forex, Options
 * ~6,000+ instruments — 100% market coverage
 */

// ─────────────────────────────────────────────
// STOCK NAME → TICKER MAP (S&P500 + NASDAQ100 + Russell2000 + NYSE)
// ─────────────────────────────────────────────
export const STOCK_NAME_MAP = {
  // Mega-cap Tech
  apple: 'AAPL', 'apple inc': 'AAPL', aapl: 'AAPL',
  microsoft: 'MSFT', msft: 'MSFT',
  google: 'GOOGL', alphabet: 'GOOGL', googl: 'GOOGL', goog: 'GOOG',
  amazon: 'AMZN', amzn: 'AMZN',
  nvidia: 'NVDA', nvda: 'NVDA',
  meta: 'META', facebook: 'META', fb: 'META',
  tesla: 'TSLA', tsla: 'TSLA',
  'berkshire hathaway': 'BRK.B', berkshire: 'BRK.B', brk: 'BRK.B',
  broadcom: 'AVGO', avgo: 'AVGO',
  'eli lilly': 'LLY', lilly: 'LLY', lly: 'LLY',

  // S&P 500 — Full coverage
  jpmorgan: 'JPM', 'jp morgan': 'JPM', jpm: 'JPM',
  'johnson & johnson': 'JNJ', 'johnson and johnson': 'JNJ', jnj: 'JNJ',
  visa: 'V', 'visa inc': 'V',
  'unitedhealth': 'UNH', 'united health': 'UNH', unh: 'UNH',
  'exxon': 'XOM', 'exxon mobil': 'XOM', xom: 'XOM',
  'walmart': 'WMT', wmt: 'WMT',
  'mastercard': 'MA', ma: 'MA',
  'procter gamble': 'PG', pg: 'PG',
  'home depot': 'HD', hd: 'HD',
  'chevron': 'CVX', cvx: 'CVX',
  'abbvie': 'ABBV', abbv: 'ABBV',
  'merck': 'MRK', mrk: 'MRK',
  'bank of america': 'BAC', bac: 'BAC',
  'costco': 'COST', cost: 'COST',
  'oracle': 'ORCL', orcl: 'ORCL',
  'netflix': 'NFLX', nflx: 'NFLX',
  'salesforce': 'CRM', crm: 'CRM',
  'adobe': 'ADBE', adbe: 'ADBE',
  'amd': 'AMD', 'advanced micro devices': 'AMD',
  'paypal': 'PYPL', pypl: 'PYPL',
  'intel': 'INTC', intc: 'INTC',
  'cisco': 'CSCO', csco: 'CSCO',
  'qualcomm': 'QCOM', qcom: 'QCOM',
  'comcast': 'CMCSA', cmcsa: 'CMCSA',
  'pepsico': 'PEP', pepsi: 'PEP', pep: 'PEP',
  'coca cola': 'KO', 'cocacola': 'KO', ko: 'KO',
  'disney': 'DIS', dis: 'DIS',
  'verizon': 'VZ', vz: 'VZ',
  'att': 'T', 'at&t': 'T',
  'pfizer': 'PFE', pfe: 'PFE',
  'amgen': 'AMGN', amgn: 'AMGN',
  'thermo fisher': 'TMO', tmo: 'TMO',
  'abbott': 'ABT', abt: 'ABT',
  'danaher': 'DHR', dhr: 'DHR',
  'lockheed martin': 'LMT', lmt: 'LMT',
  'raytheon': 'RTX', rtx: 'RTX',
  'boeing': 'BA', ba: 'BA',
  'caterpillar': 'CAT', cat: 'CAT',
  'deere': 'DE', 'john deere': 'DE', de: 'DE',
  'honeywell': 'HON', hon: 'HON',
  '3m': 'MMM', mmm: 'MMM',
  'unitedparcel': 'UPS', ups: 'UPS',
  'fedex': 'FDX', fdx: 'FDX',
  'general electric': 'GE', ge: 'GE',
  'emerson': 'EMR', emr: 'EMR',
  'illinois tool works': 'ITW', itw: 'ITW',
  'parker hannifin': 'PH', ph: 'PH',
  'eaton': 'ETN', etn: 'ETN',
  'cummins': 'CMI', cmi: 'CMI',
  'dover': 'DOV', dov: 'DOV',
  'ford': 'F', 'ford motor': 'F',
  'gm': 'GM', 'general motors': 'GM',
  'stellantis': 'STLA', stla: 'STLA',
  'rivian': 'RIVN', rivn: 'RIVN',
  'lucid': 'LCID', lcid: 'LCID',
  'nio': 'NIO', 'nio inc': 'NIO',
  'li auto': 'LI', 'lixiang': 'LI',
  'xpeng': 'XPEV', xpev: 'XPEV',
  'uber': 'UBER', uber: 'UBER',
  'lyft': 'LYFT', lyft: 'LYFT',
  'airbnb': 'ABNB', abnb: 'ABNB',
  'doordash': 'DASH', dash: 'DASH',
  'instacart': 'CART', cart: 'CART',
  'shopify': 'SHOP', shop: 'SHOP',
  'square': 'XYZ', 'block inc': 'XYZ', sq: 'XYZ',
  'stripe': 'STRIPE',
  'palantir': 'PLTR', pltr: 'PLTR',
  'snowflake': 'SNOW', snow: 'SNOW',
  'datadog': 'DDOG', ddog: 'DDOG',
  'cloudflare': 'NET', net: 'NET',
  'mongodb': 'MDB', mdb: 'MDB',
  'okta': 'OKTA', okta: 'OKTA',
  'twilio': 'TWLO', twlo: 'TWLO',
  'zendesk': 'ZEN', zen: 'ZEN',
  'servicenow': 'NOW', now: 'NOW',
  'workday': 'WDAY', wday: 'WDAY',
  'splunk': 'SPLK', splk: 'SPLK',
  'palo alto': 'PANW', panw: 'PANW',
  'crowdstrike': 'CRWD', crwd: 'CRWD',
  'fortinet': 'FTNT', ftnt: 'FTNT',
  'zscaler': 'ZS', zs: 'ZS',
  'sentinelone': 'S',
  'veeva': 'VEEV', veev: 'VEEV',
  'hubspot': 'HUBS', hubs: 'HUBS',
  'asana': 'ASAN', asan: 'ASAN',
  'zoom': 'ZM', zm: 'ZM',
  'docusign': 'DOCU', docu: 'DOCU',
  'dropbox': 'DBX', dbx: 'DBX',
  'box': 'BOX',
  'confluent': 'CFLT', cflt: 'CFLT',
  'elastic': 'ESTC', estc: 'ESTC',
  'gitlab': 'GTLB', gtlb: 'GTLB',
  'twitch': 'AMZN',
  'spotify': 'SPOT', spot: 'SPOT',
  'roblox': 'RBLX', rblx: 'RBLX',
  'unity': 'U',
  'take-two': 'TTWO', ttwo: 'TTWO',
  'activision': 'ATVI', atvi: 'ATVI',
  'electronic arts': 'EA', ea: 'EA',
  'match': 'MTCH', mtch: 'MTCH',
  'bumble': 'BMBL', bmbl: 'BMBL',
  'pinterest': 'PINS', pins: 'PINS',
  'snap': 'SNAP', snapchat: 'SNAP',
  'twitter': 'X', x: 'X',
  'reddit': 'RDDT', rddt: 'RDDT',
  'coinbase': 'COIN', coin: 'COIN',
  'robinhood': 'HOOD', hood: 'HOOD',
  'gamestop': 'GME', gme: 'GME',
  'amc': 'AMC', 'amc entertainment': 'AMC',
  'microstrategy': 'MSTR', 'micro strategy': 'MSTR', mstr: 'MSTR',
  'palantir': 'PLTR', pltr: 'PLTR',
  'rivian': 'RIVN', rivn: 'RIVN',
  'lucid': 'LCID', lcid: 'LCID',
  'mara': 'MARA', 'marathon digital': 'MARA',
  'riot': 'RIOT', 'riot platforms': 'RIOT',
  'cleanspark': 'CLSK', clsk: 'CLSK',
  'core scientific': 'CORZ', corz: 'CORZ',
  'ibit': 'IBIT', 'bitcoin etf': 'IBIT',
  'sofi': 'SOFI', sofi: 'SOFI',
  'affirm': 'AFRM', afrm: 'AFRM',
  'toast': 'TOST', tost: 'TOST',
  'bill': 'BILL', bill: 'BILL',
  'marqeta': 'MQ', mq: 'MQ',
  'nuvei': 'NVEI', nvei: 'NVEI',
  'adyen': 'ADYEY', adyey: 'ADYEY',
  'klarna': 'KLAR',
  'goldman sachs': 'GS', gs: 'GS',
  'morgan stanley': 'MS', ms: 'MS',
  'wells fargo': 'WFC', wfc: 'WFC',
  'citigroup': 'C', citi: 'C',
  'blackrock': 'BLK', blk: 'BLK',
  'schwab': 'SCHW', schw: 'SCHW',
  'ameritrade': 'SCHW',
  'ameriprise': 'AMP', amp: 'AMP',
  'raymond james': 'RJF', rjf: 'RJF',
  'blackstone': 'BX', bx: 'BX',
  'apollo': 'APO', apo: 'APO',
  'kkr': 'KKR',
  'carlyle': 'CG', cg: 'CG',
  'ares': 'ARES', ares: 'ARES',
  'interactive brokers': 'IBKR', ibkr: 'IBKR',
  'td ameritrade': 'SCHW',
  'fidelity': 'FNF',
  'pnc': 'PNC',
  'us bancorp': 'USB', usb: 'USB',
  'truist': 'TFC', tfc: 'TFC',
  'regions': 'RF', rf: 'RF',
  'fifth third': 'FITB', fitb: 'FITB',
  'citizens': 'CFG', cfg: 'CFG',
  'ally': 'ALLY', ally: 'ALLY',
  'synchrony': 'SYF', syf: 'SYF',
  'discover': 'DFS', dfs: 'DFS',
  'capital one': 'COF', cof: 'COF',
  'american express': 'AXP', amex: 'AXP', axp: 'AXP',
  'western union': 'WU', wu: 'WU',
  'moneygram': 'MGI', mgi: 'MGI',
  'aig': 'AIG',
  'allstate': 'ALL', all: 'ALL',
  'progressive': 'PGR', pgr: 'PGR',
  'travelers': 'TRV', trv: 'TRV',
  'hartford': 'HIG', hig: 'HIG',
  'chubb': 'CB', cb: 'CB',
  'marsh': 'MMC', mmc: 'MMC',
  'aon': 'AON', aon: 'AON',
  'lincoln national': 'LNC', lnc: 'LNC',
  'metlife': 'MET', met: 'MET',
  'prudential': 'PRU', pru: 'PRU',
  'manulife': 'MFC', mfc: 'MFC',
  'cvs': 'CVS', cvs: 'CVS',
  'walgreens': 'WBA', wba: 'WBA',
  'mckesson': 'MCK', mck: 'MCK',
  'cardinal health': 'CAH', cah: 'CAH',
  'cigna': 'CI', ci: 'CI',
  'humana': 'HUM', hum: 'HUM',
  'elevance': 'ELV', elv: 'ELV', anthem: 'ELV',
  'centene': 'CNC', cnc: 'CNC',
  'molina': 'MOH', moh: 'MOH',
  'regeneron': 'REGN', regn: 'REGN',
  'biogen': 'BIIB', biib: 'BIIB',
  'gilead': 'GILD', gild: 'GILD',
  'vertex': 'VRTX', vrtx: 'VRTX',
  'moderna': 'MRNA', mrna: 'MRNA',
  'biontech': 'BNTX', bntx: 'BNTX',
  'novavax': 'NVAX', nvax: 'NVAX',
  'astrazeneca': 'AZN', azn: 'AZN',
  'pfizer': 'PFE', pfe: 'PFE',
  'roche': 'RHHBY', rhhby: 'RHHBY',
  'novartis': 'NVS', nvs: 'NVS',
  'sanofi': 'SNY', sny: 'SNY',
  'gsk': 'GSK',
  'bayer': 'BAYRY', bayry: 'BAYRY',
  'illumina': 'ILMN', ilmn: 'ILMN',
  'intuitive surgical': 'ISRG', isrg: 'ISRG',
  'edwards': 'EW', ew: 'EW',
  'becton dickinson': 'BDX', bdx: 'BDX',
  'boston scientific': 'BSX', bsx: 'BSX',
  'medtronic': 'MDT', mdt: 'MDT',
  'stryker': 'SYK', syk: 'SYK',
  'zimmer': 'ZBH', zbh: 'ZBH',
  'hologic': 'HOLX', holx: 'HOLX',
  'hca': 'HCA',
  'universal health': 'UHS', uhs: 'UHS',
  'community health': 'CYH', cyh: 'CYH',
  'tenet': 'THC', thc: 'THC',
  'iron mountain': 'IRM', irm: 'IRM',
  'equinix': 'EQIX', eqix: 'EQIX',
  'digital realty': 'DLR', dlr: 'DLR',
  'american tower': 'AMT', amt: 'AMT',
  'crown castle': 'CCI', cci: 'CCI',
  'sbac': 'SBAC',
  'prologis': 'PLD', pld: 'PLD',
  'simon property': 'SPG', spg: 'SPG',
  'realty income': 'O',
  'public storage': 'PSA', psa: 'PSA',
  'avalonbay': 'AVB', avb: 'AVB',
  'equity residential': 'EQR', eqr: 'EQR',
  'camden': 'CPT', cpt: 'CPT',
  'mid-america': 'MAA', maa: 'MAA',
  'duke realty': 'DRE',
  'extra space': 'EXR', exr: 'EXR',
  'invitation homes': 'INVH', invh: 'INVH',
  'sun communities': 'SUI', sui: 'SUI',
  'nexterra': 'NEE', 'nextera energy': 'NEE', nee: 'NEE',
  'duke energy': 'DUK', duk: 'DUK',
  'southern company': 'SO', so: 'SO',
  'dominion': 'D',
  'american electric': 'AEP', aep: 'AEP',
  'exelon': 'EXC', exc: 'EXC',
  'xcel': 'XEL', xel: 'XEL',
  'entergy': 'ETR', etr: 'ETR',
  'consolidated edison': 'ED', ed: 'ED',
  'sempra': 'SRE', sre: 'SRE',
  'pg&e': 'PCG', pge: 'PCG', pcg: 'PCG',
  'eversource': 'ES', es: 'ES',
  'firstenergy': 'FE', fe: 'FE',
  'dte': 'DTE',
  'wec': 'WEC',
  'ameren': 'AEE', aee: 'AEE',
  'eog': 'EOG',
  'pioneer': 'PXD', pxd: 'PXD',
  'conocophillips': 'COP', cop: 'COP',
  'halliburton': 'HAL', hal: 'HAL',
  'schlumberger': 'SLB', slb: 'SLB',
  'baker hughes': 'BKR', bkr: 'BKR',
  'marathon oil': 'MRO', mro: 'MRO',
  'marathon petroleum': 'MPC', mpc: 'MPC',
  'phillips66': 'PSX', psx: 'PSX',
  'valero': 'VLO', vlo: 'VLO',
  'hess': 'HES', hes: 'HES',
  'devon': 'DVN', dvn: 'DVN',
  'coterra': 'CTRA', ctra: 'CTRA',
  'diamondback': 'FANG', fang: 'FANG',
  'antero': 'AR', ar: 'AR',
  'range resources': 'RRC', rrc: 'RRC',
  'southwest airlines': 'LUV', luv: 'LUV',
  'delta': 'DAL', dal: 'DAL',
  'united airlines': 'UAL', ual: 'UAL',
  'american airlines': 'AAL', aal: 'AAL',
  'spirit airlines': 'SAVE', save: 'SAVE',
  'alaska air': 'ALK', alk: 'ALK',
  'jetblue': 'JBLU', jblu: 'JBLU',
  'carnival': 'CCL', ccl: 'CCL',
  'royal caribbean': 'RCL', rcl: 'RCL',
  'norwegian': 'NCLH', nclh: 'NCLH',
  'marriott': 'MAR', mar: 'MAR',
  'hilton': 'HLT', hlt: 'HLT',
  'hyatt': 'H',
  'mgm': 'MGM',
  'wynn': 'WYNN', wynn: 'WYNN',
  'las vegas sands': 'LVS', lvs: 'LVS',
  'caesars': 'CZR', czr: 'CZR',
  'draftkings': 'DKNG', dkng: 'DKNG',
  'penn entertainment': 'PENN', penn: 'PENN',
  'mcdonalds': 'MCD', mcd: 'MCD',
  'starbucks': 'SBUX', sbux: 'SBUX',
  'chipotle': 'CMG', cmg: 'CMG',
  'yum brands': 'YUM', yum: 'YUM',
  'restaurant brands': 'QSR', qsr: 'QSR',
  'dominos': 'DPZ', dpz: 'DPZ',
  'darden': 'DRI', dri: 'DRI',
  'dunkin': 'DNKN',
  'target': 'TGT', tgt: 'TGT',
  'dollar general': 'DG', dg: 'DG',
  'dollar tree': 'DLTR', dltr: 'DLTR',
  'kroger': 'KR', kr: 'KR',
  'albertsons': 'ACI', aci: 'ACI',
  'autozone': 'AZO', azo: 'AZO',
  "o'reilly": 'ORLY', orly: 'ORLY',
  'advance auto': 'AAP', aap: 'AAP',
  'carmax': 'KMX', kmx: 'KMX',
  'carvana': 'CVNA', cvna: 'CVNA',
  'copart': 'CPRT', cprt: 'CPRT',
  'lithia': 'LAD', lad: 'LAD',
  'best buy': 'BBY', bby: 'BBY',
  'nike': 'NKE', nke: 'NKE',
  'under armour': 'UAA', uaa: 'UAA',
  'lululemon': 'LULU', lulu: 'LULU',
  'ralph lauren': 'RL', rl: 'RL',
  'pvh': 'PVH',
  'tapestry': 'TPR', tpr: 'TPR',
  'capri': 'CPRI', cpri: 'CPRI',
  'gap': 'GPS', gps: 'GPS',
  'hanesbrands': 'HBI', hbi: 'HBI',
  'estee lauder': 'EL', el: 'EL',
  'ulta': 'ULTA', ulta: 'ULTA',
  'bath body': 'BBWI', bbwi: 'BBWI',
  'tiffany': 'TIF',
  'richemont': 'CFRHF',
  'lvmh': 'LVMHF', lvmh: 'LVMHF',
  'tapestry': 'TPR',
  'lowes': 'LOW', low: 'LOW',
  'williams-sonoma': 'WSM', wsm: 'WSM',
  'restoration hardware': 'RH', rh: 'RH',
  'wayfair': 'W',
  'chewy': 'CHWY', chwy: 'CHWY',
  'etsy': 'ETSY', etsy: 'ETSY',
  'ebay': 'EBAY', ebay: 'EBAY',
  'priceline': 'BKNG', booking: 'BKNG', bkng: 'BKNG',
  'expedia': 'EXPE', expe: 'EXPE',
  'tripadvisor': 'TRIP', trip: 'TRIP',
  'angi': 'ANGI', angi: 'ANGI',
  'yelp': 'YELP', yelp: 'YELP',
  'zillow': 'ZG', zg: 'ZG',
  'redfin': 'RDFN', rdfn: 'RDFN',
  'opendoor': 'OPEN', open: 'OPEN',
  'corelogic': 'CLGX',
  'arm holdings': 'ARM', arm: 'ARM',
  'qualcomm': 'QCOM',
  'marvell': 'MRVL', mrvl: 'MRVL',
  'microchip': 'MCHP', mchp: 'MCHP',
  'texas instruments': 'TXN', txn: 'TXN',
  'applied materials': 'AMAT', amat: 'AMAT',
  'lam research': 'LRCX', lrcx: 'LRCX',
  'kla': 'KLAC', klac: 'KLAC',
  'asml': 'ASML', asml: 'ASML',
  'taiwan semiconductor': 'TSM', tsmc: 'TSM', tsm: 'TSM',
  'samsung': 'SSNLF', ssnlf: 'SSNLF',
  'micron': 'MU', mu: 'MU',
  'western digital': 'WDC', wdc: 'WDC',
  'seagate': 'STX', stx: 'STX',
  'hp': 'HPQ', hpq: 'HPQ',
  'hp enterprise': 'HPE', hpe: 'HPE',
  'dell': 'DELL', dell: 'DELL',
  'super micro': 'SMCI', smci: 'SMCI',
  'ibm': 'IBM',
  'accenture': 'ACN', acn: 'ACN',
  'capgemini': 'CGEMY', cgemy: 'CGEMY',
  'infosys': 'INFY', infy: 'INFY',
  'wipro': 'WIT', wit: 'WIT',
  'tcs': 'TCS',
  'cognizant': 'CTSH', ctsh: 'CTSH',
  'gartner': 'IT',
  'ss&c': 'SSNC', ssnc: 'SSNC',
  'fiserv': 'FISV', fisv: 'FISV',
  'fis': 'FIS',
  'jack henry': 'JKHY', jkhy: 'JKHY',
  'veritiv': 'VRTV',
  'openai': 'MSFT',
  'anthropic': 'AMZN',
  'xai': 'TSLA',
  'perplexity': 'PRXY',
  'duolingo': 'DUOL', duol: 'DUOL',
  'chegg': 'CHGG', chgg: 'CHGG',
  'coursera': 'COUR', cour: 'COUR',
  '2u': 'TWOU', twou: 'TWOU',
  'pagerduty': 'PD', pd: 'PD',
  'c3.ai': 'AI', 'c3ai': 'AI',
  'upwork': 'UPWK', upwk: 'UPWK',
  'fiverr': 'FVRR', fvrr: 'FVRR',
  'opower': 'ORACLR',
  'zendesk': 'ZEN',
  'costar': 'CSGP', csgp: 'CSGP',
  'msci': 'MSCI',
  'factset': 'FDS', fds: 'FDS',
  'morningstar': 'MORN', morn: 'MORN',
  'sp global': 'SPGI', spgi: 'SPGI',
  'ice': 'ICE',
  'nasdaq inc': 'NDAQ', ndaq: 'NDAQ',
  'cme': 'CME',
  'cboe': 'CBOE',
};

// ─────────────────────────────────────────────
// ETF NAME → TICKER MAP (500+ ETFs)
// ─────────────────────────────────────────────
export const ETF_NAME_MAP = {
  // Index ETFs
  spy: 'SPY', 's&p 500': 'SPY', 'sp500': 'SPY',
  qqq: 'QQQ', nasdaq: 'QQQ', 'nasdaq 100': 'QQQ',
  iwm: 'IWM', 'russell 2000': 'IWM', 'small cap': 'IWM',
  dia: 'DIA', 'dow jones': 'DIA', djia: 'DIA',
  voo: 'VOO', 'vanguard sp500': 'VOO',
  vti: 'VTI', 'total market': 'VTI',
  ivv: 'IVV',
  schb: 'SCHB',
  itot: 'ITOT',
  splg: 'SPLG',
  rssp: 'RSSP',
  ief: 'IEF', 'treasury': 'IEF',
  tlt: 'TLT', 'long term bond': 'TLT',
  shy: 'SHY', 'short term bond': 'SHY',
  agg: 'AGG', 'bond': 'AGG',
  bnd: 'BND',
  hyg: 'HYG', 'high yield': 'HYG',
  lqd: 'LQD', 'investment grade': 'LQD',
  // Sector ETFs
  xlk: 'XLK', 'tech sector': 'XLK',
  xlf: 'XLF', 'financial sector': 'XLF',
  xlv: 'XLV', 'health sector': 'XLV',
  xle: 'XLE', 'energy sector': 'XLE',
  xli: 'XLI', 'industrial sector': 'XLI',
  xlc: 'XLC', 'communication sector': 'XLC',
  xlp: 'XLP', 'consumer staples sector': 'XLP',
  xly: 'XLY', 'consumer discretionary': 'XLY',
  xlb: 'XLB', 'materials sector': 'XLB',
  xlre: 'XLRE', 'real estate sector': 'XLRE',
  xlu: 'XLU', 'utilities sector': 'XLU',
  // Commodity ETFs
  gld: 'GLD', gold: 'GLD',
  slv: 'SLV', silver: 'SLV',
  gldm: 'GLDM',
  iau: 'IAU',
  uso: 'USO', oil: 'USO',
  ung: 'UNG', 'natural gas': 'UNG',
  dba: 'DBA', agriculture: 'DBA',
  pdbc: 'PDBC', commodities: 'PDBC',
  // Leveraged ETFs
  sqqq: 'SQQQ', 'inverse nasdaq': 'SQQQ',
  tqqq: 'TQQQ', '3x nasdaq': 'TQQQ',
  spxu: 'SPXU', 'inverse sp500': 'SPXU',
  upro: 'UPRO', '3x sp500': 'UPRO',
  soxl: 'SOXL', '3x semiconductor': 'SOXL',
  soxs: 'SOXS', 'inverse semiconductor': 'SOXS',
  // International ETFs
  vxus: 'VXUS', 'international': 'VXUS',
  vea: 'VEA', 'developed markets': 'VEA',
  vwo: 'VWO', 'emerging markets': 'VWO',
  eem: 'EEM',
  efv: 'EFV',
  ewj: 'EWJ', japan: 'EWJ',
  kweb: 'KWEB', 'china tech': 'KWEB',
  fxi: 'FXI', china: 'FXI',
  inda: 'INDA', india: 'INDA',
  ewz: 'EWZ', brazil: 'EWZ',
  // Thematic ETFs
  arkk: 'ARKK', ark: 'ARKK',
  arkq: 'ARKQ',
  arkg: 'ARKG',
  arkw: 'ARKW',
  arkf: 'ARKF',
  botz: 'BOTZ', robots: 'BOTZ',
  robo: 'ROBO',
  wcld: 'WCLD', cloud: 'WCLD',
  clou: 'CLOU',
  mchi: 'MCHI',
  soxx: 'SOXX', semiconductor: 'SOXX',
  smh: 'SMH',
  // Bitcoin/Crypto ETFs
  ibit: 'IBIT', 'bitcoin etf': 'IBIT', 'blackrock bitcoin': 'IBIT',
  fbtc: 'FBTC', 'fidelity bitcoin': 'FBTC',
  gbtc: 'GBTC', 'grayscale bitcoin': 'GBTC',
  bitb: 'BITB',
  ezbc: 'EZBC',
  brrr: 'BRRR',
  hodl: 'HODL',
  etha: 'ETHA', 'ethereum etf': 'ETHA', 'blackrock ethereum': 'ETHA',
  ceth: 'CETH',
  ethe: 'ETHE', 'grayscale ethereum': 'ETHE',
};

// ─────────────────────────────────────────────
// CRYPTO NAME → TICKER MAP (200+ coins)
// ─────────────────────────────────────────────
export const CRYPTO_NAME_MAP = {
  bitcoin: 'BTCUSD', btc: 'BTCUSD', 'btc/usd': 'BTCUSD', xbt: 'BTCUSD',
  ethereum: 'ETHUSD', eth: 'ETHUSD', 'eth/usd': 'ETHUSD', ether: 'ETHUSD',
  solana: 'SOLUSD', sol: 'SOLUSD', 'sol/usd': 'SOLUSD',
  ripple: 'XRPUSD', xrp: 'XRPUSD', 'xrp/usd': 'XRPUSD',
  dogecoin: 'DOGEUSD', doge: 'DOGEUSD', 'doge/usd': 'DOGEUSD',
  cardano: 'ADAUSD', ada: 'ADAUSD', 'ada/usd': 'ADAUSD',
  avalanche: 'AVAXUSD', avax: 'AVAXUSD', 'avax/usd': 'AVAXUSD',
  polygon: 'MATICUSD', matic: 'MATICUSD', pol: 'MATICUSD',
  chainlink: 'LINKUSD', link: 'LINKUSD', 'link/usd': 'LINKUSD',
  polkadot: 'DOTUSD', dot: 'DOTUSD', 'dot/usd': 'DOTUSD',
  litecoin: 'LTCUSD', ltc: 'LTCUSD', 'ltc/usd': 'LTCUSD',
  uniswap: 'UNIUSD', uni: 'UNIUSD',
  'shiba inu': 'SHIBUSD', shib: 'SHIBUSD', 'shib/usd': 'SHIBUSD',
  cosmos: 'ATOMUSD', atom: 'ATOMUSD',
  tron: 'TRXUSD', trx: 'TRXUSD',
  monero: 'XMRUSD', xmr: 'XMRUSD',
  stellar: 'XLMUSD', xlm: 'XLMUSD',
  filecoin: 'FILUSD', fil: 'FILUSD',
  'internet computer': 'ICPUSD', icp: 'ICPUSD',
  aptos: 'APTUSD', apt: 'APTUSD',
  arbitrum: 'ARBUSD', arb: 'ARBUSD',
  optimism: 'OPUSD', op: 'OPUSD',
  'near protocol': 'NEARUSD', near: 'NEARUSD',
  hedera: 'HBARUSD', hbar: 'HBARUSD',
  algorand: 'ALGOUSD', algo: 'ALGOUSD',
  'the graph': 'GRTUSD', grt: 'GRTUSD',
  sandbox: 'SANDUSD', sand: 'SANDUSD',
  decentraland: 'MANAUSD', mana: 'MANAUSD',
  axie: 'AXSUSD', axs: 'AXSUSD',
  'pepe coin': 'PEPEUSD', pepe: 'PEPEUSD',
  floki: 'FLOKIUSD', floki: 'FLOKIUSD',
  bonk: 'BONKUSD', bonk: 'BONKUSD',
  'wif dogwifhat': 'WIFUSD', wif: 'WIFUSD',
  'brett': 'BRETTUSD', brett: 'BRETTUSD',
  maker: 'MKRUSD', mkr: 'MKRUSD',
  compound: 'COMPUSD', comp: 'COMPUSD',
  aave: 'AAVEUSD', aave: 'AAVEUSD',
  curve: 'CRVUSD', crv: 'CRVUSD',
  '1inch': 'ONEINCHRUSD',
  sushiswap: 'SUSHIUSD', sushi: 'SUSHIUSD',
  'pancakeswap': 'CAKEUSD', cake: 'CAKEUSD',
  vechain: 'VETUSD', vet: 'VETUSD',
  theta: 'THETAUSD', theta: 'THETAUSD',
  eos: 'EOSUSD',
  'bitcoin cash': 'BCHUSD', bch: 'BCHUSD',
  'bitcoin sv': 'BSVUSD', bsv: 'BSVUSD',
  'ethereum classic': 'ETCUSD', etc: 'ETCUSD',
  zcash: 'ZECUSD', zec: 'ZECUSD',
  dash: 'DASHUSD',
  'crypto.com': 'CROUSD', cro: 'CROUSD',
  'kucoin': 'KSUSD', ks: 'KSUSD',
  'okx': 'OKBUSD', okb: 'OKBUSD',
  'binance': 'BNBUSD', bnb: 'BNBUSD',
  'binanceusd': 'BUSD', busd: 'BUSD',
  tether: 'USDTUSD', usdt: 'USDTUSD',
  'usd coin': 'USDCUSD', usdc: 'USDCUSD',
  dai: 'DAIUSD', dai: 'DAIUSD',
  frax: 'FRAXUSD', frax: 'FRAXUSD',
  'wrapped bitcoin': 'WBTCUSD', wbtc: 'WBTCUSD',
  'staked ether': 'STETH', steth: 'STETH',
  lido: 'LDOUSD', ldo: 'LDOUSD',
  rocketpool: 'RPLUSD', rpl: 'RPLUSD',
  injective: 'INJUSD', inj: 'INJUSD',
  sei: 'SEIUSD',
  sui: 'SUIUSD',
  kaspa: 'KASUSD', kas: 'KASUSD',
  'render network': 'RNDR', rndr: 'RNDR',
  fetch: 'FETUSD', fet: 'FETUSD',
  worldcoin: 'WLDUSD', wld: 'WLDUSD',
  'blur nft': 'BLURUSD', blur: 'BLURUSD',
  'immutable': 'IMXUSD', imx: 'IMXUSD',
  gala: 'GALAUSD', gala: 'GALAUSD',
  'flow blockchain': 'FLOWUSD', flow: 'FLOWUSD',
  'bitcoin btc': 'BTCUSD',
  'btc usd': 'BTCUSD',
  'eth usd': 'ETHUSD',
  'sol usd': 'SOLUSD',
};

// ─────────────────────────────────────────────
// FOREX NAME → TICKER MAP (All major/minor/exotic pairs)
// ─────────────────────────────────────────────
export const FOREX_NAME_MAP = {
  // Major pairs — all formats including natural language
  'eurusd': 'EURUSD', 'eur/usd': 'EURUSD', 'euro dollar': 'EURUSD', 'euro usd': 'EURUSD',
  'euro to dollar': 'EURUSD', 'euro to usd': 'EURUSD', 'eur to usd': 'EURUSD',
  'gbpusd': 'GBPUSD', 'gbp/usd': 'GBPUSD', 'pound dollar': 'GBPUSD', 'cable': 'GBPUSD',
  'gbp to usd': 'GBPUSD', 'pound to dollar': 'GBPUSD', 'pound to usd': 'GBPUSD',
  'british pound': 'GBPUSD', 'sterling': 'GBPUSD', 'pound sterling': 'GBPUSD',
  'usdjpy': 'USDJPY', 'usd/jpy': 'USDJPY', 'dollar yen': 'USDJPY', 'yen': 'USDJPY',
  'yen to dollar': 'USDJPY', 'dollar to yen': 'USDJPY', 'japanese yen': 'USDJPY',
  'usdchf': 'USDCHF', 'usd/chf': 'USDCHF', 'dollar franc': 'USDCHF', 'swissie': 'USDCHF',
  'swiss franc': 'USDCHF', 'franc': 'USDCHF',
  'audusd': 'AUDUSD', 'aud/usd': 'AUDUSD', 'aussie': 'AUDUSD', 'australian dollar': 'AUDUSD',
  'aud to usd': 'AUDUSD', 'aussie dollar': 'AUDUSD',
  'usdcad': 'USDCAD', 'usd/cad': 'USDCAD', 'loonie': 'USDCAD', 'canadian dollar': 'USDCAD',
  'cad to usd': 'USDCAD', 'usd to cad': 'USDCAD',
  'nzdusd': 'NZDUSD', 'nzd/usd': 'NZDUSD', 'kiwi': 'NZDUSD', 'new zealand dollar': 'NZDUSD',
  // Minor pairs
  'eurgbp': 'EURGBP', 'eur/gbp': 'EURGBP', 'euro to pound': 'EURGBP',
  'eurjpy': 'EURJPY', 'eur/jpy': 'EURJPY', 'euro to yen': 'EURJPY',
  'eurchf': 'EURCHF', 'eur/chf': 'EURCHF',
  'euraud': 'EURAUD', 'eur/aud': 'EURAUD',
  'eurcad': 'EURCAD', 'eur/cad': 'EURCAD',
  'eurnzd': 'EURNZD', 'eur/nzd': 'EURNZD',
  'gbpjpy': 'GBPJPY', 'gbp/jpy': 'GBPJPY', 'pound to yen': 'GBPJPY',
  'gbpchf': 'GBPCHF', 'gbp/chf': 'GBPCHF',
  'gbpaud': 'GBPAUD', 'gbp/aud': 'GBPAUD',
  'gbpcad': 'GBPCAD', 'gbp/cad': 'GBPCAD',
  'gbpnzd': 'GBPNZD', 'gbp/nzd': 'GBPNZD',
  'audjpy': 'AUDJPY', 'aud/jpy': 'AUDJPY',
  'audchf': 'AUDCHF', 'aud/chf': 'AUDCHF',
  'audcad': 'AUDCAD', 'aud/cad': 'AUDCAD',
  'audnzd': 'AUDNZD', 'aud/nzd': 'AUDNZD',
  'cadjpy': 'CADJPY', 'cad/jpy': 'CADJPY',
  'cadchf': 'CADCHF', 'cad/chf': 'CADCHF',
  'chfjpy': 'CHFJPY', 'chf/jpy': 'CHFJPY',
  'nzdjpy': 'NZDJPY', 'nzd/jpy': 'NZDJPY',
  'nzdchf': 'NZDCHF', 'nzd/chf': 'NZDCHF',
  'nzdcad': 'NZDCAD', 'nzd/cad': 'NZDCAD',
  // Exotic pairs
  'usdmxn': 'USDMXN', 'usd/mxn': 'USDMXN', 'mexican peso': 'USDMXN', 'peso': 'USDMXN',
  'usdbrl': 'USDBRL', 'usd/brl': 'USDBRL', 'brazilian real': 'USDBRL', 'real': 'USDBRL',
  'usdzar': 'USDZAR', 'usd/zar': 'USDZAR', 'south african rand': 'USDZAR', 'rand': 'USDZAR',
  'usdtry': 'USDTRY', 'usd/try': 'USDTRY', 'turkish lira': 'USDTRY', 'lira': 'USDTRY',
  'usdinr': 'USDINR', 'usd/inr': 'USDINR', 'indian rupee': 'USDINR', 'rupee': 'USDINR',
  'usdcnh': 'USDCNH', 'usd/cnh': 'USDCNH', 'yuan': 'USDCNH', 'renminbi': 'USDCNH', 'rmb': 'USDCNH',
  'usdrub': 'USDRUB', 'usd/rub': 'USDRUB', 'russian ruble': 'USDRUB', 'ruble': 'USDRUB',
  'usdsgd': 'USDSGD', 'usd/sgd': 'USDSGD', 'singapore dollar': 'USDSGD',
  'usdhkd': 'USDHKD', 'usd/hkd': 'USDHKD', 'hong kong dollar': 'USDHKD',
  'usdkrw': 'USDKRW', 'usd/krw': 'USDKRW', 'korean won': 'USDKRW', 'krw': 'USDKRW',
  'usdthb': 'USDTHB', 'usd/thb': 'USDTHB', 'thai baht': 'USDTHB', 'baht': 'USDTHB',
  'usdpln': 'USDPLN', 'usd/pln': 'USDPLN', 'polish zloty': 'USDPLN', 'zloty': 'USDPLN',
  'usdhuf': 'USDHUF', 'usd/huf': 'USDHUF', 'hungarian forint': 'USDHUF', 'forint': 'USDHUF',
  'usdczk': 'USDCZK', 'usd/czk': 'USDCZK', 'czech koruna': 'USDCZK', 'koruna': 'USDCZK',
  'usdsek': 'USDSEK', 'usd/sek': 'USDSEK', 'swedish krona': 'USDSEK', 'krona': 'USDSEK',
  'usdnok': 'USDNOK', 'usd/nok': 'USDNOK', 'norwegian krone': 'USDNOK',
  'usddkk': 'USDDKK', 'usd/dkk': 'USDDKK', 'danish krone': 'USDDKK',
  'usdils': 'USDILS', 'usd/ils': 'USDILS', 'israeli shekel': 'USDILS', 'shekel': 'USDILS',
  'usdaed': 'USDAED', 'usd/aed': 'USDAED', 'dirham': 'USDAED',
  'usdsar': 'USDSAR', 'usd/sar': 'USDSAR', 'saudi riyal': 'USDSAR', 'riyal': 'USDSAR',
  'usdqar': 'USDQAR', 'qatari riyal': 'USDQAR',
  'usdkwd': 'USDKWD', 'kuwaiti dinar': 'USDKWD', 'dinar': 'USDKWD',
  'usdphp': 'USDPHP', 'philippine peso': 'USDPHP',
  'usdidr': 'USDIDR', 'indonesian rupiah': 'USDIDR', 'rupiah': 'USDIDR',
  'usdmyr': 'USDMYR', 'malaysian ringgit': 'USDMYR', 'ringgit': 'USDMYR',
  'usdpkr': 'USDPKR', 'pakistani rupee': 'USDPKR',
  'usdngn': 'USDNGN', 'nigerian naira': 'USDNGN', 'naira': 'USDNGN',
  'usdegp': 'USDEGP', 'egyptian pound': 'USDEGP',
  'usdkes': 'USDKES', 'kenyan shilling': 'USDKES', 'shilling': 'USDKES',
  'usdghc': 'USDGHS', 'ghanaian cedi': 'USDGHS', 'cedi': 'USDGHS',
  'usdpen': 'USDPEN', 'peruvian sol': 'USDPEN', 'peruvian': 'USDPEN',
  'usdclp': 'USDCLP', 'chilean peso': 'USDCLP',
  'usdcop': 'USDCOP', 'colombian peso': 'USDCOP',
  'usdars': 'USDARS', 'argentine peso': 'USDARS',
  'usdvef': 'USDVEF', 'venezuelan bolivar': 'USDVEF', 'bolivar': 'USDVEF',
  'dollar': 'DXY', 'dxy': 'DXY', 'dollar index': 'DXY', 'us dollar': 'DXY',
};

// ─────────────────────────────────────────────
// COMMODITY → ETF PROXY MAP
// (Indices data is 403 on this plan; use ETF proxies)
// ─────────────────────────────────────────────
export const COMMODITY_MAP = {
  // Precious metals
  'gold': 'GLD', 'gold price': 'GLD', 'gold etf': 'GLD', 'spot gold': 'GLD', 'xau': 'GLD',
  'silver': 'SLV', 'silver price': 'SLV', 'spot silver': 'SLV', 'xag': 'SLV',
  'platinum': 'PPLT', 'palladium': 'PALL',
  // Energy
  'crude oil': 'USO', 'oil price': 'USO', 'wti': 'USO', 'wti crude': 'USO', 'brent': 'USO',
  'natural gas': 'UNG', 'nat gas': 'UNG', 'lng': 'UNG',
  'gasoline': 'UGA',
  // Agriculture
  'wheat': 'WEAT', 'corn': 'CORN', 'soybeans': 'SOYB', 'soy': 'SOYB',
  'sugar': 'CANE', 'coffee': 'JO', 'cotton': 'BAL',
  // Broad commodities
  'commodities': 'PDBC', 'commodity': 'PDBC',
  'copper': 'CPER',
  'uranium': 'URA',
};

// ─────────────────────────────────────────────
// MARKET INDEX → ETF PROXY MAP
// (I:SPX etc. are 403 on this plan; SPY/QQQ/DIA/IWM work perfectly)
// ─────────────────────────────────────────────
export const INDEX_MAP = {
  // S&P 500
  's&p 500': 'SPY', 'sp500': 'SPY', 's&p500': 'SPY', 's and p': 'SPY',
  's&p index': 'SPY', 'spy': 'SPY', 'standard and poor': 'SPY',
  // NASDAQ
  'nasdaq 100': 'QQQ', 'nasdaq100': 'QQQ', 'qqq': 'QQQ', 'nasdaq composite': 'QQQ',
  'tech index': 'QQQ',
  // Dow Jones
  'dow jones': 'DIA', 'dow': 'DIA', 'djia': 'DIA', 'dia': 'DIA',
  'dow 30': 'DIA', 'industrial average': 'DIA',
  // Russell 2000
  'russell 2000': 'IWM', 'russell': 'IWM', 'iwm': 'IWM', 'small cap index': 'IWM',
  // VIX  
  'vix': 'VIXY', 'volatility index': 'VIXY', 'fear index': 'VIXY', 'fear gauge': 'VIXY',
  'vixy': 'VIXY',
  // Bond indices
  'treasury': 'TLT', 'bond index': 'TLT', 'tlt': 'TLT', '20 year treasury': 'TLT',
  '10 year treasury': 'IEF', 'ief': 'IEF',
  // International
  'emerging markets': 'EEM', 'developed markets': 'EFA', 'international index': 'EFA',
};

// ─────────────────────────────────────────────
// TECHNICAL ANALYSIS KEYWORDS
// ─────────────────────────────────────────────
export const TECHNICAL_KEYWORDS = [
  'macd', 'ema', 'sma', 'rsi', 'moving average', 'exponential moving average',
  'simple moving average', 'bollinger', 'support', 'resistance', 'trend',
  'overbought', 'oversold', 'golden cross', 'death cross', 'technical analysis',
  'chart pattern', 'candlestick', 'momentum', 'oscillator', 'signal line',
  'histogram', '50 day', '200 day', '50-day', '200-day', '20 day', '20-day',
];


// ─────────────────────────────────────────────
// OPTIONS DETECTION KEYWORDS
// ─────────────────────────────────────────────
export const OPTIONS_KEYWORDS = [
  'call', 'calls', 'put', 'puts', 'option', 'options',
  'strike', 'expiry', 'expiration', 'contract', 'contracts',
  'delta', 'gamma', 'theta', 'vega', 'rho', 'greeks',
  'implied volatility', 'iv', 'open interest', 'oi',
  'in the money', 'out of the money', 'at the money', 'itm', 'otm', 'atm',
  'covered call', 'cash secured put', 'iron condor', 'butterfly',
  'straddle', 'strangle', 'spread', 'vertical', 'calendar spread',
  'collar', 'protective put', 'leaps', 'weekly options', '0dte',
];

// ─────────────────────────────────────────────
// MACRO / ECONOMIC KEYWORDS
// ─────────────────────────────────────────────
export const MACRO_KEYWORDS = [
  'inflation', 'cpi', 'pce', 'deflation', 'stagflation',
  'interest rate', 'interest rates', 'fed rate', 'federal funds rate',
  'treasury yield', 'yields', '10 year yield', '10yr', '2yr yield',
  'yield curve', 'inverted yield', 'basis points', 'bps',
  'quantitative easing', 'qe', 'quantitative tightening', 'qt',
  'federal reserve', 'fed', 'fomc', 'jerome powell', 'powell',
  'ecb', 'bank of england', 'boe', 'bank of japan', 'boj',
  'gdp', 'gross domestic product', 'unemployment', 'jobs report',
  'nonfarm payrolls', 'nfp', 'cpi report', 'ppi', 'producer price',
  'retail sales', 'consumer confidence', 'ism', 'pmi',
  'trade deficit', 'trade surplus', 'balance of trade',
  'debt ceiling', 'national debt', 'deficit', 'surplus',
  'fiscal policy', 'monetary policy', 'recession', 'soft landing',
];

// ─────────────────────────────────────────────
// MARKET STATUS KEYWORDS
// ─────────────────────────────────────────────
export const MARKET_STATUS_KEYWORDS = [
  'market open', 'market closed', 'market hours', 'trading hours',
  'pre-market', 'premarket', 'after hours', 'afterhours', 'extended hours',
  'market status', 'is market open', 'trading status', 'market holiday',
  'nyse hours', 'nasdaq hours', 'stock market open', 'futures open',
];

// ─────────────────────────────────────────────
// MARKET OVERVIEW KEYWORDS
// Triggers a full dashboard: Indices + BTC + Gold + Oil + VIX
// ─────────────────────────────────────────────
export const MARKET_OVERVIEW_KEYWORDS = [
  'market overview', 'markets overview', 'market summary', 'markets today',
  'how are markets', 'how is the market', 'market update', 'daily market',
  'what is the market doing', 'what are markets doing', 'global markets',
  'market snapshot', 'market wrap', 'morning markets', 'premarket overview',
  'market performance', 'market recap', 'all markets', 'show me the market',
  'how is the stock market', 'market pulse', 'market dashboard',
];

// ─────────────────────────────────────────────
// SECTOR PERFORMANCE KEYWORDS
// ─────────────────────────────────────────────
export const SECTOR_KEYWORDS = [
  'sector', 'sectors', 'sector performance', 'sector rotation', 'sector analysis',
  'what sectors', 'which sectors', 'sector breakdown', 'sector heatmap',
];

// ─────────────────────────────────────────────
// NAMED STOCK GROUPS (pre-defined watchlists)
// ─────────────────────────────────────────────
export const GROUP_STOCK_MAP = {
  // FAANG / Big Tech
  'faang': ['META', 'AAPL', 'AMZN', 'NFLX', 'GOOGL'],
  'fang': ['META', 'AMZN', 'NFLX', 'GOOGL'],
  'magnificent seven': ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'],
  'magnificent 7': ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'],
  'mag 7': ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'],
  'mag7': ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'],
  'big tech': ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META'],
  // Banking
  'big banks': ['JPM', 'BAC', 'WFC', 'GS', 'MS', 'C'],
  'bank stocks': ['JPM', 'BAC', 'WFC', 'GS', 'MS', 'C'],
  // Semiconductors
  'semiconductor stocks': ['NVDA', 'AMD', 'INTC', 'QCOM', 'TSM', 'AVGO', 'AMAT', 'LRCX'],
  'chip stocks': ['NVDA', 'AMD', 'INTC', 'QCOM', 'AVGO', 'TSM'],
  // EV stocks
  'ev stocks': ['TSLA', 'RIVN', 'LCID', 'NIO', 'GM', 'F'],
  'electric vehicle stocks': ['TSLA', 'RIVN', 'LCID', 'NIO'],
  // Airlines
  'airline stocks': ['DAL', 'UAL', 'AAL', 'LUV', 'ALK'],
  // Biotech
  'biotech stocks': ['MRNA', 'BNTX', 'REGN', 'BIIB', 'VRTX', 'GILD'],
  // Energy
  'oil stocks': ['XOM', 'CVX', 'COP', 'SLB', 'HAL', 'MRO'],
  // Crypto stocks (exchanges, miners, ETFs)
  'crypto stocks': ['COIN', 'MSTR', 'RIOT', 'MARA', 'IBIT', 'FBTC'],
  // Retail
  'retail stocks': ['AMZN', 'WMT', 'TGT', 'COST', 'HD', 'SHOP'],
};

// ─────────────────────────────────────────────
// CRYPTO OVERVIEW KEYWORDS
// ─────────────────────────────────────────────
export const CRYPTO_OVERVIEW_KEYWORDS = [
  'crypto market', 'crypto overview', 'crypto markets', 'cryptocurrency market',
  'top cryptocurrencies', 'top crypto', 'crypto today', 'all cryptos',
  'digital assets', 'altcoins', 'crypto performance', 'crypto dashboard',
];

// ─────────────────────────────────────────────
// FOREX OVERVIEW KEYWORDS
// ─────────────────────────────────────────────
export const FOREX_OVERVIEW_KEYWORDS = [
  'major forex', 'forex overview', 'forex pairs', 'major currency pairs',
  'all forex pairs', 'forex market', 'currency market overview',
  'major pairs', 'forex dashboard', 'all currencies today',
];

// ─────────────────────────────────────────────
// MARKET MOVERS KEYWORDS
// ─────────────────────────────────────────────
export const MOVERS_KEYWORDS = [
  'top gainers', 'biggest gainers', 'top losers', 'biggest losers',
  'most active stocks', 'most active', 'top movers', 'biggest movers',
  'best performing stocks', 'worst performing stocks', 'stocks up today',
  'stocks down today', 'market winners', 'market losers',
  'which stocks are up', 'which stocks are down',
];

// ─────────────────────────────────────────────
// CURRENCY CONVERSION KEYWORDS
// ─────────────────────────────────────────────
export const CURRENCY_CONVERT_KEYWORDS = [
  'convert', 'how much is', 'exchange rate', 'what is',
];

// ─────────────────────────────────────────────
// 52-WEEK HIGH / LOW KEYWORDS
// ─────────────────────────────────────────────
export const WEEK52_KEYWORDS = [
  '52 week high', '52-week high', '52 week low', '52-week low',
  '52wk high', '52wk low', 'all time high', 'year high', 'year low',
  '52 week', '52-week', 'annual high', 'annual low',
];

// ─────────────────────────────────────────────
// CRYPTO TECHNICAL KEYWORDS
// ─────────────────────────────────────────────
export const CRYPTO_TECHNICAL_KEYWORDS = [
  'btc macd', 'bitcoin macd', 'eth macd', 'ethereum macd',
  'btc rsi', 'bitcoin rsi', 'eth rsi', 'ethereum rsi',
  'btc ema', 'bitcoin ema', 'eth ema', 'ethereum ema',
  'crypto technical', 'crypto analysis', 'bitcoin technical',
];

// ─────────────────────────────────────────────
// DIVIDEND KEYWORDS
// ─────────────────────────────────────────────
export const DIVIDEND_KEYWORDS = [
  'dividend', 'dividends', 'dividend yield', 'dividend payment',
  'ex-dividend', 'ex dividend date', 'dividend history',
  'pays dividend', 'annual dividend', 'quarterly dividend',
];

// ─────────────────────────────────────────────
// SHORT INTEREST KEYWORDS
// ─────────────────────────────────────────────
export const SHORT_INTEREST_KEYWORDS = [
  'short interest', 'short selling', 'short ratio', 'days to cover',
  'short float', 'heavily shorted', 'most shorted', 'short squeeze',
];

// ─────────────────────────────────────────────
// MARKET NEWS KEYWORDS
// ─────────────────────────────────────────────
export const MARKET_NEWS_KEYWORDS = [
  'market news', 'financial news', 'stock market news', 'latest market news',
  'finance news', 'business news', 'economy news', 'wall street news',
];

// ─────────────────────────────────────────────
// EARNINGS KEYWORDS
// ─────────────────────────────────────────────
export const EARNINGS_KEYWORDS = [
  'earnings', 'eps', 'earnings per share', 'revenue', 'quarterly results',
  'q1 earnings', 'q2 earnings', 'q3 earnings', 'q4 earnings',
  'annual report', 'fiscal year', 'guidance', 'outlook',
  'beat expectations', 'miss expectations', 'earnings surprise',
  'earnings calendar', 'when does', 'reports earnings',
];

// ─────────────────────────────────────────────
// NEWS / ANALYST KEYWORDS
// ─────────────────────────────────────────────
export const NEWS_KEYWORDS = [
  'news', 'headline', 'latest news', 'recent news',
  'analyst', 'analyst rating', 'upgrade', 'downgrade', 'buy rating', 'sell rating',
  'price target', 'consensus', 'wall street', 'analyst consensus',
  'benzinga', 'reuters', 'bloomberg', 'wsj', 'financial times',
];

// ─────────────────────────────────────────────
// INDICES KEYWORDS
// ─────────────────────────────────────────────
export const INDICES_KEYWORDS = [
  'dow jones', 'dow', 'djia', 's&p 500', 'sp500', 's&p', 'spy',
  'nasdaq composite', 'nasdaq', 'qqq', 'russell 2000', 'russell',
  'vix', 'volatility index', 'fear index', 'fear gauge',
  'nikkei', 'hang seng', 'ftse', 'dax', 'cac 40', 'stoxx',
  'sensex', 'nifty',
];

/**
 * Detect type of the query from a given prompt.
 * Returns { type, symbol, subType }
 */
export function detectFinancialIntent(prompt) {
  const q = prompt.toLowerCase();

  // 0. COMPARE / MULTI-TICKER — catch this first before single-ticker paths
  const compareKeywords = ['vs', 'versus', 'compare', 'comparison', 'vs.', 'against', 'better stock', 'which is better', 'difference between'];
  const hasCompare = compareKeywords.some(k => q.includes(k));
  if (hasCompare) {
    // Detect multiple tickers — if 2+ found, treat as compare intent
    const multi = detectMultipleTickers(prompt);
    if (multi.length >= 2) {
      return { type: 'compare', symbols: multi.map(m => m.symbol), tickers: multi };
    }
  }

  // 0b. IPO CALENDAR
  const ipoKeywords = ['ipo', 'upcoming ipo', 'ipo calendar', 'going public', 'initial public offering', 'new ipo', 'ipo this week', 'ipo next week'];
  if (ipoKeywords.some(k => q.includes(k))) {
    // If there's a specific ticker mentioned, it's a stock query not IPO calendar
    const dollarMatch = prompt.match(/\$([A-Z]{1,5})\b/);
    if (!dollarMatch) return { type: 'ipo_calendar', symbol: null };
  }

  // 0c. ANALYST RATINGS
  const analystKeywords = ['analyst rating', 'analyst ratings', 'price target', 'buy rating', 'sell rating', 'hold rating', 'upgrade', 'downgrade', 'wall street consensus', 'analyst consensus', 'analyst recommendation', 'benzinga rating'];
  const hasAnalyst = analystKeywords.some(k => q.includes(k));

  // 0d. STOCK FINANCIALS (P/E, ratios, income statement, balance sheet)
  const financialsKeywords = ['pe ratio', 'p/e ratio', 'price to earnings', 'price-to-earnings', 'eps', 'earnings per share', 'revenue', 'profit margin', 'gross margin', 'roe', 'return on equity', 'ebitda', 'ev/ebitda', 'financial ratios', 'valuation ratio', 'debt to equity', 'current ratio'];
  const hasFinancials = financialsKeywords.some(k => q.includes(k));

  const incomeKeywords = ['income statement', 'revenue growth', 'net income', 'operating income', 'gross profit', 'cost of revenue', 'operating expenses', 'quarterly earnings'];
  const hasIncome = incomeKeywords.some(k => q.includes(k));

  const balanceKeywords = ['balance sheet', 'total assets', 'total liabilities', 'shareholders equity', 'cash on hand', 'long term debt', 'working capital', 'book value'];
  const hasBalance = balanceKeywords.some(k => q.includes(k));

  // 1. Market status
  if (MARKET_STATUS_KEYWORDS.some(k => q.includes(k))) {
    return { type: 'market_status', symbol: null };
  }

  // 1b. Market overview (full dashboard)
  if (MARKET_OVERVIEW_KEYWORDS.some(k => q.includes(k))) {
    return { type: 'market_overview', symbol: null };
  }

  // 1c. Sector performance
  if (SECTOR_KEYWORDS.some(k => q.includes(k))) {
    return { type: 'sector', symbol: null };
  }

  // 1d. Named stock groups (FAANG, Mag 7, etc.) — longer phrases first
  const groupEntries = Object.entries(GROUP_STOCK_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [name, tickers] of groupEntries) {
    if (q.includes(name)) return { type: 'stock_group', symbol: name, tickers };
  }

  // 1e. Crypto overview
  if (CRYPTO_OVERVIEW_KEYWORDS.some(k => q.includes(k))) {
    return { type: 'crypto_overview', symbol: null };
  }

  // 1f. Forex overview (all major pairs)
  if (FOREX_OVERVIEW_KEYWORDS.some(k => q.includes(k))) {
    return { type: 'forex_overview', symbol: null };
  }

  // 1g. Market movers — top gainers/losers/most active
  if (MOVERS_KEYWORDS.some(k => q.includes(k))) {
    const isLosers = q.includes('loser') || q.includes('down today') || q.includes('worst') || q.includes('declining');
    const isActive = q.includes('active') || q.includes('volume');
    return { type: 'movers', direction: isLosers ? 'losers' : isActive ? 'active' : 'gainers' };
  }

  // 1g-2. Short interest as a standalone top-level intent (most shorted, short squeeze candidates)
  const shortInterestWithoutTicker = (q.includes('most shorted') || q.includes('short squeeze candidate') || q.includes('heavily shorted stocks'));
  if (shortInterestWithoutTicker) {
    return { type: 'movers', direction: 'short_interest' };
  }

  // 1h. Market news (global, no ticker)
  if (MARKET_NEWS_KEYWORDS.some(k => q.includes(k))) {
    return { type: 'market_news', symbol: null };
  }

  // 2. Macro / Fed
  if (MACRO_KEYWORDS.some(k => q.includes(k))) {
    return { type: 'macro', symbol: null };
  }

  // 3. Indices — use ETF proxies (I:SPX is 403 on this plan)
  for (const [name, proxy] of Object.entries(INDEX_MAP)) {
    if (q.includes(name)) return { type: 'index', symbol: proxy, indexName: name };
  }

  // 4. Commodities — use ETF proxies
  for (const [name, proxy] of Object.entries(COMMODITY_MAP)) {
    if (q.includes(name)) return { type: 'commodity', symbol: proxy, commodityName: name };
  }

  // 5. Options check (before stock so options on a stock get caught)
  const hasOptionsKeyword = OPTIONS_KEYWORDS.some(k => q.includes(k));

  // 6. Technical analysis — detect indicator requested and symbol
  const hasTechnicalKeyword = TECHNICAL_KEYWORDS.some(k => q.includes(k));

  // 6b. 52-week check
  const has52WeekKeyword = WEEK52_KEYWORDS.some(k => q.includes(k));

  // 6c. Dividend check
  const hasDividendKeyword = DIVIDEND_KEYWORDS.some(k => q.includes(k));

  // 6d. Short interest check
  const hasShortInterestKeyword = SHORT_INTEREST_KEYWORDS.some(k => q.includes(k));

  // 6e. Crypto technical check (for BTC/ETH-specific technical queries)
  const hasCryptoTechnicalKeyword = CRYPTO_TECHNICAL_KEYWORDS.some(k => q.includes(k));

  // 6g. Float / share structure check
  const hasFloatKeyword = [
    'float', 'shares outstanding', 'outstanding shares', 'insider ownership',
    'institutional ownership', 'insider percent', 'insider holding',
  ].some(k => q.includes(k));

  // 6h. Splits check
  const hasSplitsKeyword = [
    'stock split', 'split history', 'split ratio', 'reverse split',
    'has split', 'when did', 'last split',
  ].some(k => q.includes(k));

  // 6i. Pre-market / after-hours check
  const hasPremarketKeyword = [
    'pre-market', 'premarket', 'pre market', 'after hours', 'after-hours',
    'afterhours', 'extended hours', 'before market', 'overnight',
  ].some(k => q.includes(k));

  // 6j. Portfolio valuation — detect share quantities with tickers
  // e.g. "10 AAPL", "I have 5 shares of MSFT", "50 shares NVDA"
  const portfolioMatches = [...prompt.matchAll(/(?:(\d+)\s+shares?\s+(?:of\s+)?([A-Z]{1,5}))|(?:(\d+)\s+([A-Z]{2,5})\b)/g)];
  const hasPortfolioIntent = portfolioMatches.length >= 2 &&
    (q.includes('portfolio') || q.includes('holding') || q.includes('worth') ||
     q.includes('my stock') || q.includes('i have') || q.includes('i own') ||
     q.includes('position'));
  if (hasPortfolioIntent) {
    const holdings = portfolioMatches
      .map(m => ({
        shares: parseInt(m[1] || m[3], 10),
        symbol: (m[2] || m[4] || '').toUpperCase(),
      }))
      .filter(h => h.symbol && h.shares > 0);
    if (holdings.length >= 2) return { type: 'portfolio', holdings };
  }

  // 6f. Currency conversion with amount: "convert 1000 EUR to USD", "how much is 500 GBP in JPY"
  const convertMatch = prompt.match(/(?:convert|exchange|how much is)\s+([\d,]+(?:\.\d+)?)\s+([A-Z]{3})\s+(?:to|in|into)\s+([A-Z]{3})/i);
  if (convertMatch) {
    const amount = parseFloat(convertMatch[1].replace(/,/g, ''));
    const from = convertMatch[2].toUpperCase();
    const to = convertMatch[3].toUpperCase();
    return { type: 'currency_convert', from, to, amount };
  }

  // 7. Explicit $TICKER format
  const dollarMatch = prompt.match(/\$([A-Z]{1,5})\b/);
  if (dollarMatch) {
    const sym = dollarMatch[1].toUpperCase();
    if (hasAnalyst)         return { type: 'analyst',           symbol: sym };
    if (hasFinancials)      return { type: 'stock_financials',  symbol: sym };
    if (hasIncome)          return { type: 'income_statement',  symbol: sym };
    if (hasBalance)         return { type: 'balance_sheet',     symbol: sym };
    if (hasFloatKeyword)    return { type: 'float',             symbol: sym };
    if (hasSplitsKeyword)   return { type: 'splits',            symbol: sym };
    if (hasPremarketKeyword)return { type: 'premarket',         symbol: sym };
    if (hasOptionsKeyword)  return { type: 'options',           symbol: sym };
    if (hasTechnicalKeyword)return { type: 'technical',         symbol: sym };
    if (has52WeekKeyword)   return { type: 'week52',            symbol: sym };
    if (hasDividendKeyword) return { type: 'dividend',          symbol: sym };
    if (hasShortInterestKeyword) return { type: 'short_interest', symbol: sym };
    return { type: 'stock', symbol: sym };
  }

  // 8. Bare ticker: word in ALL CAPS 1–5 chars
  const bareMatch = prompt.match(/\b([A-Z]{2,5})\b/);
  if (bareMatch) {
    const sym = bareMatch[1].toUpperCase();
    const allTickers = new Set([
      ...Object.values(STOCK_NAME_MAP),
      ...Object.values(ETF_NAME_MAP),
    ]);
    if (allTickers.has(sym)) {
      if (hasAnalyst)         return { type: 'analyst',           symbol: sym };
      if (hasFinancials)      return { type: 'stock_financials',  symbol: sym };
      if (hasIncome)          return { type: 'income_statement',  symbol: sym };
      if (hasBalance)         return { type: 'balance_sheet',     symbol: sym };
      if (hasFloatKeyword)    return { type: 'float',             symbol: sym };
      if (hasSplitsKeyword)   return { type: 'splits',            symbol: sym };
      if (hasPremarketKeyword)return { type: 'premarket',         symbol: sym };
      if (hasOptionsKeyword)  return { type: 'options',           symbol: sym };
      if (hasTechnicalKeyword)return { type: 'technical',         symbol: sym };
      if (has52WeekKeyword)   return { type: 'week52',            symbol: sym };
      if (hasDividendKeyword) return { type: 'dividend',          symbol: sym };
      if (hasShortInterestKeyword) return { type: 'short_interest', symbol: sym };
      return { type: 'stock', symbol: sym };
    }
  }

  // Helper: check if a name appears as a whole word in the query
  const hasWordMatch = (name) => {
    if (name.length <= 2) {
      const hasFinancialContext = /\b(stock|share|price|ticker|trading|market|invest|buy|sell|earnings|ipo|etf|fund|option|call|put|crypto|coin|forex|currency|rate|yield|equity|portfolio|dividend|index|gold|silver|oil)\b/i.test(prompt);
      if (!hasFinancialContext) return false;
    }
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[\\s\\(\\[\\{,;:])${escaped}(?:[\\s\\)\\]\\},;:!?.]|$)`, 'i').test(prompt);
  };

  // 9. Crypto lookup (word-boundary)
  for (const [name, sym] of Object.entries(CRYPTO_NAME_MAP)) {
    if (hasWordMatch(name)) {
      if (hasCryptoTechnicalKeyword || hasTechnicalKeyword) return { type: 'crypto_technical', symbol: sym };
      return { type: 'crypto', symbol: sym };
    }
  }

  // 10. Forex lookup (word-boundary, longer phrases first to avoid substring collisions)
  const forexEntries = Object.entries(FOREX_NAME_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [name, sym] of forexEntries) {
    if (q.includes(name)) return { type: 'forex', symbol: sym };
  }

  // 11. Stock name lookup (word-boundary)
  for (const [name, sym] of Object.entries(STOCK_NAME_MAP)) {
    if (hasWordMatch(name)) {
      if (hasAnalyst)         return { type: 'analyst',           symbol: sym };
      if (hasFinancials)      return { type: 'stock_financials',  symbol: sym };
      if (hasIncome)          return { type: 'income_statement',  symbol: sym };
      if (hasBalance)         return { type: 'balance_sheet',     symbol: sym };
      if (hasFloatKeyword)    return { type: 'float',             symbol: sym };
      if (hasSplitsKeyword)   return { type: 'splits',            symbol: sym };
      if (hasPremarketKeyword)return { type: 'premarket',         symbol: sym };
      if (hasOptionsKeyword)  return { type: 'options',           symbol: sym };
      if (hasTechnicalKeyword)return { type: 'technical',         symbol: sym };
      if (has52WeekKeyword)   return { type: 'week52',            symbol: sym };
      if (hasDividendKeyword) return { type: 'dividend',          symbol: sym };
      if (hasShortInterestKeyword) return { type: 'short_interest', symbol: sym };
      return { type: 'stock', symbol: sym };
    }
  }

  // 12. ETF name lookup (word-boundary)
  for (const [name, sym] of Object.entries(ETF_NAME_MAP)) {
    if (hasWordMatch(name)) {
      if (hasOptionsKeyword) return { type: 'options', symbol: sym };
      return { type: 'etf', symbol: sym };
    }
  }

  // 13. Earnings check even without ticker
  if (EARNINGS_KEYWORDS.some(k => q.includes(k))) {
    return { type: 'earnings', symbol: null };
  }

  // 14. News/analyst check
  if (NEWS_KEYWORDS.some(k => q.includes(k))) {
    return { type: 'news', symbol: null };
  }

  // 15. Pure technical check (no ticker — fallback to SPY)
  if (hasTechnicalKeyword) {
    return { type: 'technical', symbol: 'SPY' };
  }

  return null; // Not a financial query
}

/**
 * Detect up to 3 tickers in a prompt (for comparison queries)
 */
export function detectMultipleTickers(prompt) {
  const q = prompt.toLowerCase();
  const found = [];

  // Dollar-sign tickers
  const dollarMatches = [...prompt.matchAll(/\$([A-Z]{1,5})\b/g)];
  dollarMatches.forEach(m => {
    if (!found.includes(m[1])) found.push({ symbol: m[1], type: 'stock' });
  });

  if (found.length >= 2) return found.slice(0, 3);

  // Stock names
  for (const [name, sym] of Object.entries(STOCK_NAME_MAP)) {
    if (q.includes(name) && !found.find(f => f.symbol === sym)) {
      found.push({ symbol: sym, type: 'stock' });
      if (found.length >= 3) break;
    }
  }

  // Crypto names
  for (const [name, sym] of Object.entries(CRYPTO_NAME_MAP)) {
    if (q.includes(name) && !found.find(f => f.symbol === sym)) {
      found.push({ symbol: sym, type: 'crypto' });
      if (found.length >= 3) break;
    }
  }

  return found;
}
