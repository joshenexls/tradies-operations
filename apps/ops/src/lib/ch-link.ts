/** Companies House search URL for verifying a prospect's corporate status. */
export function chSearchUrl(name: string): string {
  return `https://find-and-update.company-information.service.gov.uk/search?q=${encodeURIComponent(name)}`
}
