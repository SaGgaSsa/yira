import { resolveSupportedLanguage } from './language'

if (resolveSupportedLanguage('es-AR') !== 'es') {
  throw new Error('Spanish locales must resolve to Spanish')
}

if (resolveSupportedLanguage('es-ES') !== 'es') {
  throw new Error('Spanish locales from Spain must resolve to Spanish')
}

if (resolveSupportedLanguage('en-US') !== 'en') {
  throw new Error('Non-Spanish locales must fall back to English')
}

if (resolveSupportedLanguage(undefined) !== 'en') {
  throw new Error('Missing locales must fall back to English')
}
