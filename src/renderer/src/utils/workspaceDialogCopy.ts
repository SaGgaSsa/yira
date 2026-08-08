export type WorkspaceDialogCopyMode = 'first' | 'new'

export interface WorkspaceDialogCopy {
  title: string
  eyebrow: string
  confirmLabel: string
}

type Translate = (key: string) => string

export function getWorkspaceDialogCopy(
  mode: WorkspaceDialogCopyMode,
  translate: Translate,
): WorkspaceDialogCopy {
  if (mode === 'first') {
    return {
      title: translate('app.createFirstWorkspace'),
      eyebrow: translate('app.firstWorkspaceSetup'),
      confirmLabel: translate('app.newWorkspace'),
    }
  }

  return {
    title: translate('app.newWorkspace'),
    eyebrow: translate('workspace.workspaceSettings'),
    confirmLabel: translate('app.newWorkspace'),
  }
}
