import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAgentAlertNotificationText,
  decideAgentAlertNotification,
} from './agentAlertNotifications'

test('disabled desktop alerts produce no notification or sound', () => {
  assert.deepEqual(decideAgentAlertNotification({
    enabled: false,
    windowFocused: false,
    activeWorkspaceId: 'workspace-a',
    alertWorkspaceId: 'workspace-b',
    tileMuted: false,
  }), { toast: false, sound: false })
})

test('muted agent tiles produce no notification or sound', () => {
  assert.deepEqual(decideAgentAlertNotification({
    enabled: true,
    windowFocused: false,
    activeWorkspaceId: 'workspace-a',
    alertWorkspaceId: 'workspace-b',
    tileMuted: true,
  }), { toast: false, sound: false })
})

test('an unfocused window shows a toast and plays a sound', () => {
  assert.deepEqual(decideAgentAlertNotification({
    enabled: true,
    windowFocused: false,
    activeWorkspaceId: 'workspace-a',
    alertWorkspaceId: 'workspace-a',
    tileMuted: false,
  }), { toast: true, sound: true })
})

test('a focused window plays a sound for a different workspace only', () => {
  assert.deepEqual(decideAgentAlertNotification({
    enabled: true,
    windowFocused: true,
    activeWorkspaceId: 'workspace-a',
    alertWorkspaceId: 'workspace-b',
    tileMuted: false,
  }), { toast: false, sound: true })
})

test('a focused window ignores the active workspace and unknown workspace alerts', () => {
  const activeWorkspaceDecision = decideAgentAlertNotification({
    enabled: true,
    windowFocused: true,
    activeWorkspaceId: 'workspace-a',
    alertWorkspaceId: 'workspace-a',
    tileMuted: false,
  })
  const unknownWorkspaceDecision = decideAgentAlertNotification({
    enabled: true,
    windowFocused: true,
    activeWorkspaceId: 'workspace-a',
    alertWorkspaceId: null,
    tileMuted: false,
  })

  assert.deepEqual(activeWorkspaceDecision, { toast: false, sound: false })
  assert.deepEqual(unknownWorkspaceDecision, { toast: false, sound: false })
})

test('toast text includes provider, workspace, event, and session title', () => {
  assert.deepEqual(buildAgentAlertNotificationText({
    providerLabel: 'Claude',
    workspaceName: 'Yira',
    sessionTitle: 'Fix alert routing',
    eventLabel: 'Needs your reply',
  }), {
    title: 'Claude · Yira',
    body: 'Needs your reply — Fix alert routing',
  })
})

test('toast text omits missing workspace and session names', () => {
  assert.deepEqual(buildAgentAlertNotificationText({
    providerLabel: 'Codex',
    workspaceName: null,
    sessionTitle: null,
    eventLabel: 'Finished',
  }), {
    title: 'Codex',
    body: 'Finished',
  })
})
