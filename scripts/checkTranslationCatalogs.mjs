import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const catalogDirectory = path.resolve(scriptDirectory, '../src/i18n/catalogs')
const catalogFiles = (await readdir(catalogDirectory))
  .filter(file => file.endsWith('.json'))
  .sort()
const discoveredLocales = catalogFiles.map(file => path.basename(file, '.json'))
const locales = ['en', ...discoveredLocales.filter(locale => locale !== 'en')]

if (!discoveredLocales.includes('en')) {
  throw new Error('Translation reference catalog en.json is missing')
}

const catalogs = Object.fromEntries(await Promise.all(locales.map(async locale => {
  const source = await readFile(path.join(catalogDirectory, `${locale}.json`), 'utf8')

  return [locale, JSON.parse(source)]
})))
const referenceLocale = locales[0]
const reference = catalogs[referenceLocale]
const referenceKeys = Object.keys(reference).sort()
const errors = []

for (const locale of locales) {
  const catalog = catalogs[locale]
  const keys = Object.keys(catalog).sort()
  const missing = referenceKeys.filter(key => !(key in catalog))
  const extra = keys.filter(key => !(key in reference))

  for (const key of missing) {
    errors.push(`${locale}: missing key "${key}"`)
  }

  for (const key of extra) {
    errors.push(`${locale}: extra key "${key}"`)
  }

  for (const key of referenceKeys) {
    if (!(key in catalog)) continue

    if (typeof catalog[key] !== 'string') {
      errors.push(`${locale}: "${key}" must be a string`)
      continue
    }

    if (typeof reference[key] !== 'string') continue

    const expected = placeholders(reference[key])
    const actual = placeholders(catalog[key])

    if (expected.join(',') !== actual.join(',')) {
      errors.push(
        `${locale}: "${key}" placeholders [${actual.join(', ')}] ` +
        `do not match ${referenceLocale} [${expected.join(', ')}]`
      )
    }
  }
}

if (errors.length > 0) {
  console.error(`Translation catalog check failed:\n${errors.map(error => `- ${error}`).join('\n')}`)
  process.exitCode = 1
} else {
  console.log(
    `Translation catalogs match: ${locales.length} locales, ` +
    `${referenceKeys.length} keys, placeholders aligned`
  )
}

function placeholders(message) {
  return [...message.matchAll(/\{\{(\w+)\}\}/g)]
    .map(match => match[1])
    .sort()
}
