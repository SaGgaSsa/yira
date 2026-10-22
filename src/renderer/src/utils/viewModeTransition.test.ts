import { resolveAgentsViewSwitch, resolveViewModeTransition } from './viewModeTransition'
import type { SplitViewState, TileState } from '@shared/types'

function tile(id: string, zIndex: number): TileState {
  return {
    id,
    type: 'terminal',
    x: 0,
    y: 0,
    width: 900,
    height: 400,
    zIndex,
  }
}

const splitViewState: SplitViewState = {
  leftTileIds: ['left'],
  rightTileIds: ['right'],
  activeLeftTileId: 'left',
  activeRightTileId: 'right',
  focusedPanel: 'left',
  orientation: 'vertical',
}

const gridFocus = resolveViewModeTransition({
  activeWorkspaceType: 'grid',
  currentViewMode: 'gridview',
  requestedMode: 'fullview',
  focusedTileId: 'second',
  fullviewActiveTileId: null,
  tiles: [tile('first', 1), tile('second', 2)],
  splitViewState,
})

if (gridFocus?.viewMode !== 'fullview') {
  throw new Error('Grid Focus must switch to fullview')
}

if (gridFocus.fullviewActiveTileId !== 'second') {
  throw new Error('Grid Focus must use the focused tile as the fullview active tile')
}

const gridSplitMode = resolveViewModeTransition({
  activeWorkspaceType: 'grid',
  currentViewMode: 'gridview',
  requestedMode: 'splitview',
  focusedTileId: 'second',
  fullviewActiveTileId: null,
  tiles: [tile('first', 1), tile('second', 2)],
  splitViewState,
})

if (gridSplitMode?.viewMode !== 'splitview' || gridSplitMode.workspaceTypeSwitch) {
  throw new Error('Grid workspaces must allow split view without changing workspace type')
}

const canvasToGridSwitch = resolveViewModeTransition({
  activeWorkspaceType: 'canvas',
  currentViewMode: 'canvas',
  requestedMode: 'gridview',
  focusedTileId: 'second',
  fullviewActiveTileId: null,
  tiles: [tile('first', 1), tile('second', 2)],
  splitViewState,
})

if (canvasToGridSwitch?.workspaceTypeSwitch !== 'grid' || canvasToGridSwitch.viewMode !== 'gridview') {
  throw new Error('Canvas must transition to Grid through the workspace type switch path')
}

const gridToCanvasSwitch = resolveViewModeTransition({
  activeWorkspaceType: 'grid',
  currentViewMode: 'gridview',
  requestedMode: 'canvas',
  focusedTileId: 'second',
  fullviewActiveTileId: null,
  tiles: [tile('first', 1), tile('second', 2)],
  splitViewState,
})

if (gridToCanvasSwitch?.workspaceTypeSwitch !== 'canvas' || gridToCanvasSwitch.viewMode !== 'canvas') {
  throw new Error('Grid must transition to Canvas through the workspace type switch path')
}

const agentsSwitchBase = {
  workspaceType: 'canvas' as const,
  requestedMode: 'fullview' as const,
  visibleSessionIds: ['a', 'b'],
  focusedSessionId: 'b',
  maximizedSessionId: null,
}

const agentsFocusMaximizesFocused = resolveAgentsViewSwitch(agentsSwitchBase)
if (agentsFocusMaximizesFocused?.type !== 'maximize' || agentsFocusMaximizesFocused.sessionId !== 'b') {
  throw new Error('Focus in Agents View must maximize the focused session')
}

const agentsFocusFallsBackToFirst = resolveAgentsViewSwitch({ ...agentsSwitchBase, focusedSessionId: 'gone' })
if (agentsFocusFallsBackToFirst?.type !== 'maximize' || agentsFocusFallsBackToFirst.sessionId !== 'a') {
  throw new Error('Focus in Agents View must fall back to the first visible session')
}

const agentsFocusWhenMaximized = resolveAgentsViewSwitch({ ...agentsSwitchBase, maximizedSessionId: 'a' })
if (agentsFocusWhenMaximized?.type !== 'toggle-reading-mode') {
  throw new Error('Focus with a maximized session must toggle reading mode')
}

const agentsCanvasShowsAll = resolveAgentsViewSwitch({ ...agentsSwitchBase, requestedMode: 'canvas', maximizedSessionId: 'a' })
if (agentsCanvasShowsAll?.type !== 'show-all') {
  throw new Error('Canvas with a maximized session must show every session')
}

const agentsGridShowsAll = resolveAgentsViewSwitch({
  ...agentsSwitchBase,
  workspaceType: 'grid',
  requestedMode: 'gridview',
  maximizedSessionId: 'a',
})
if (agentsGridShowsAll?.type !== 'show-all') {
  throw new Error('Grid in a grid workspace must show every session')
}

const agentsCanvasWhenAllShown = resolveAgentsViewSwitch({ ...agentsSwitchBase, requestedMode: 'canvas' })
if (agentsCanvasWhenAllShown?.type !== 'none') {
  throw new Error('Canvas while every session is shown must do nothing')
}

if (resolveAgentsViewSwitch({ ...agentsSwitchBase, requestedMode: 'splitview' }) !== null) {
  throw new Error('Split must leave Agents View for the workspace tiles')
}

if (resolveAgentsViewSwitch({ ...agentsSwitchBase, requestedMode: 'board' }) !== null) {
  throw new Error('Board must leave Agents View for the workspace tiles')
}

if (resolveAgentsViewSwitch({ ...agentsSwitchBase, visibleSessionIds: [] }) !== null) {
  throw new Error('Agents View without sessions must keep the workspace behavior')
}
