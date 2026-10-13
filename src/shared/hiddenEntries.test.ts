import { isHiddenRelativePath, shouldHideEntry } from './hiddenEntries'

if (!shouldHideEntry('.env') || !shouldHideEntry('Node_Modules') || shouldHideEntry('src')) {
  throw new Error('dotfiles and ignored folders must be hidden')
}
if (!isHiddenRelativePath('src/.cache/a.ts') || isHiddenRelativePath('src/app/a.ts') || !isHiddenRelativePath('dist/')) {
  throw new Error('a path is hidden when any segment is hidden')
}
