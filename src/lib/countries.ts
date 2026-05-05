// ISO 3166-1 alpha-2 countries and territories used by auth/profile country fields.
export interface Country { code: string; name: string; aliases?: string[]; }

const COUNTRY_CODES = [
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
  'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS',
  'BT', 'BV', 'BW', 'BY', 'BZ',
  'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW',
  'CX', 'CY', 'CZ',
  'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ',
  'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET',
  'FI', 'FJ', 'FK', 'FM', 'FO', 'FR',
  'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT',
  'GU', 'GW', 'GY',
  'HK', 'HM', 'HN', 'HR', 'HT', 'HU',
  'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT',
  'JE', 'JM', 'JO', 'JP',
  'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ',
  'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY',
  'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS',
  'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ',
  'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ',
  'OM',
  'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY',
  'QA',
  'RE', 'RO', 'RS', 'RU', 'RW',
  'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS',
  'ST', 'SV', 'SX', 'SY', 'SZ',
  'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ',
  'UA', 'UG', 'UM', 'US', 'UY', 'UZ',
  'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU',
  'WF', 'WS',
  'XK',
  'YE', 'YT',
  'ZA', 'ZM', 'ZW',
];

const NAME_OVERRIDES: Record<string, string> = {
  BO: 'Bolivia',
  CD: 'Democratic Republic of the Congo',
  CG: 'Republic of the Congo',
  CI: "Côte d'Ivoire",
  CV: 'Cabo Verde',
  CZ: 'Czech Republic',
  FM: 'Micronesia',
  GB: 'United Kingdom',
  IR: 'Iran',
  KP: 'North Korea',
  KR: 'South Korea',
  LA: 'Laos',
  MD: 'Moldova',
  MK: 'North Macedonia',
  PS: 'Palestine',
  RU: 'Russia',
  ST: 'São Tomé and Príncipe',
  SY: 'Syria',
  TW: 'Taiwan',
  TZ: 'Tanzania',
  US: 'United States',
  VA: 'Vatican City',
  VE: 'Venezuela',
  VN: 'Vietnam',
  XK: 'Kosovo',
};

const COUNTRY_ALIASES: Record<string, string[]> = {
  AX: ['Aland Islands'],
  BO: ['Bolivia, Plurinational State of'],
  CD: ['Congo DRC', 'DR Congo', 'Congo-Kinshasa'],
  CG: ['Congo', 'Congo-Brazzaville'],
  CI: ["Cote d'Ivoire", 'Cote d Ivoire', 'Cote divoire', 'Ivory Coast'],
  CV: ['Cape Verde'],
  CZ: ['Czechia'],
  FK: ['Falkland Islands', 'Malvinas'],
  FM: ['Federated States of Micronesia'],
  GB: ['Great Britain', 'Britain', 'UK'],
  HK: ['Hong Kong SAR'],
  IR: ['Iran, Islamic Republic of'],
  KP: ['Korea North', 'DPRK'],
  KR: ['Korea South', 'Republic of Korea'],
  LA: ["Lao People's Democratic Republic"],
  MO: ['Macao SAR', 'Macau'],
  MD: ['Moldova, Republic of'],
  PS: ['Palestinian Territory'],
  RU: ['Russian Federation'],
  ST: ['Sao Tome and Principe'],
  SY: ['Syrian Arab Republic'],
  TW: ['Taiwan, Province of China'],
  TZ: ['Tanzania, United Republic of'],
  US: ['USA', 'United States of America'],
  VA: ['Holy See'],
  VE: ['Venezuela, Bolivarian Republic of'],
  VN: ['Viet Nam'],
};

const regionNames =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

function getCountryName(code: string) {
  if (NAME_OVERRIDES[code]) return NAME_OVERRIDES[code];
  try {
    return regionNames?.of(code) || code;
  } catch {
    return code;
  }
}

export const COUNTRIES: Country[] = COUNTRY_CODES
  .map(code => ({
    code,
    name: getCountryName(code),
    aliases: COUNTRY_ALIASES[code],
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

export function normalizeCountrySearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

export function countryMatches(country: Country, query: string): boolean {
  const needle = normalizeCountrySearch(query);
  if (!needle) return true;

  const haystack = normalizeCountrySearch([
    country.code,
    country.name,
    ...(country.aliases || []),
  ].join(' '));

  return haystack.includes(needle);
}

// Flag emoji from ISO code
export function countryFlag(code: string): string {
  const normalized = code?.toUpperCase();
  if (!normalized || normalized.length !== 2) return '';
  const base = 0x1F1E6 - 65;
  return String.fromCodePoint(
    normalized.charCodeAt(0) + base,
    normalized.charCodeAt(1) + base,
  );
}

export function countryName(code: string): string {
  const normalized = code?.toUpperCase();
  return COUNTRIES.find(c => c.code === normalized)?.name || code;
}
