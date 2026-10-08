// Display-only metadata for the Engines page. Vault decides what is listed;
// this only names the type and marks Enterprise-only engines.
const NAMES: Record<string, string> = {
  kv: 'Key/Value',
  transit: 'Transit',
  pki: 'PKI',
  ssh: 'SSH',
  totp: 'TOTP',
  transform: 'Transform',
  kmip: 'KMIP',
  keymgmt: 'Key Management',
  spiffe: 'SPIFFE',
}
const ENTERPRISE = new Set(['transform', 'kmip', 'keymgmt', 'spiffe', 'pki-external-ca'])

export const engineName = (type: string): string => NAMES[type] ?? type
export const isEnterpriseEngine = (type: string): boolean => ENTERPRISE.has(type)
