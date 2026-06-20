import { getUpdateErrorMessage } from './updateErrorMessage'

const networkError = Object.assign(new Error('request failed'), { code: 'ENOTFOUND' })
if (getUpdateErrorMessage(networkError) !== 'Unable to reach GitHub. Check your internet connection and try again.') {
  throw new Error('network errors must provide connection guidance')
}

const timeoutError = Object.assign(new Error('request failed'), { code: 'ETIMEDOUT' })
if (getUpdateErrorMessage(timeoutError) !== 'Unable to reach GitHub. Check your internet connection and try again.') {
  throw new Error('network timeouts must provide connection guidance')
}

const missingManifest = new Error('Cannot find latest.yml in the latest release artifacts: HttpError: 404')
if (getUpdateErrorMessage(missingManifest) !== 'This Yira release is missing update information. Try again later or download the latest version from GitHub Releases.') {
  throw new Error('missing manifests must explain the incomplete release')
}

const authorizationError = new Error('HttpError: 403')
if (getUpdateErrorMessage(authorizationError) !== 'GitHub could not authorize the update check. Try again later.') {
  throw new Error('authorization failures must not expose raw updater details')
}

const invalidMetadata = new Error('Cannot parse latest.yml')
if (getUpdateErrorMessage(invalidMetadata) !== 'GitHub returned invalid update information. Try again later.') {
  throw new Error('invalid metadata must explain the invalid response')
}

const fallback = new Error('unexpected upstream failure')
if (getUpdateErrorMessage(fallback) !== 'Unable to check for updates right now. Try again later.') {
  throw new Error('unknown failures must use the safe fallback')
}
