export function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase('ru-RU')
    .normalize('NFD')
    .replace(/([a-z])[\u0300-\u036f]+/g, '$1')
    .normalize('NFC')
    .replace(/ё/g, 'е')
    .replace(/^№\s*/, '')
    .replace(/\s+/g, ' ')
}
