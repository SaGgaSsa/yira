const NETWORK_ERROR_CODES = new Set([
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETUNREACH',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ETIMEDOUT',
])

interface ErrorDetails {
  code?: unknown
  message?: unknown
  statusCode?: unknown
}

function getErrorDetails(error: unknown): { code: string; message: string; statusCode: string } {
  if (typeof error !== 'object' || error === null) {
    return {
      code: '',
      message: typeof error === 'string' ? error : '',
      statusCode: '',
    }
  }

  const details = error as ErrorDetails
  return {
    code: typeof details.code === 'string' ? details.code.toUpperCase() : '',
    message: typeof details.message === 'string' ? details.message.toLowerCase() : '',
    statusCode: typeof details.statusCode === 'number' || typeof details.statusCode === 'string'
      ? String(details.statusCode)
      : '',
  }
}

export function getUpdateErrorMessage(error: unknown): string {
  const { code, message, statusCode } = getErrorDetails(error)
  const errorText = `${code.toLowerCase()} ${message}`
  const isNotFound = statusCode === '404' || /httperror:\s*404|status(?:code)?\s*[:=]?\s*404/.test(message)
  const isUnauthorized = statusCode === '401' || statusCode === '403'
    || /httperror:\s*(401|403)|status(?:code)?\s*[:=]?\s*(401|403)/.test(message)

  if (NETWORK_ERROR_CODES.has(code) || /\b(eai_again|econnrefused|econnreset|enetunreach|enotfound|ehostunreach|etimedout|network error)\b/.test(errorText)) {
    return 'Unable to reach GitHub. Check your internet connection and try again.'
  }

  if (message.includes('latest.yml') && isNotFound) {
    return 'This Yira release is missing update information. Try again later or download the latest version from GitHub Releases.'
  }

  if (isUnauthorized) {
    return 'GitHub could not authorize the update check. Try again later.'
  }

  if (message.includes('latest.yml') && /\b(parse|invalid|malformed|corrupt)\b/.test(message)) {
    return 'GitHub returned invalid update information. Try again later.'
  }

  return 'Unable to check for updates right now. Try again later.'
}
