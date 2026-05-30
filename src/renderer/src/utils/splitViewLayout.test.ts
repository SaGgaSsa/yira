import { getSplitPanelFrame, SPLIT_TAB_STRIP_HEIGHT_PX } from './splitViewLayout'

const leftHorizontal = getSplitPanelFrame('horizontal', 'left')
if (leftHorizontal.top !== SPLIT_TAB_STRIP_HEIGHT_PX) {
  throw new Error(`left horizontal panel must start below its tab strip, got ${leftHorizontal.top}`)
}
if (leftHorizontal.height !== `calc(50% - ${SPLIT_TAB_STRIP_HEIGHT_PX}px)`) {
  throw new Error(`left horizontal panel must reserve tab height, got ${leftHorizontal.height}`)
}

const rightHorizontal = getSplitPanelFrame('horizontal', 'right')
if (rightHorizontal.top !== `calc(50% + ${SPLIT_TAB_STRIP_HEIGHT_PX}px)`) {
  throw new Error(`right horizontal panel must start below the second tab strip, got ${rightHorizontal.top}`)
}
if (rightHorizontal.height !== `calc(50% - ${SPLIT_TAB_STRIP_HEIGHT_PX}px)`) {
  throw new Error(`right horizontal panel must reserve tab height, got ${rightHorizontal.height}`)
}

const leftVertical = getSplitPanelFrame('vertical', 'left')
if (leftVertical.left !== 0 || leftVertical.top !== 0 || leftVertical.width !== '50%' || leftVertical.height !== '100%') {
  throw new Error(`left vertical panel frame changed unexpectedly: ${JSON.stringify(leftVertical)}`)
}

const rightVertical = getSplitPanelFrame('vertical', 'right')
if (rightVertical.left !== '50%' || rightVertical.top !== 0 || rightVertical.width !== '50%' || rightVertical.height !== '100%') {
  throw new Error(`right vertical panel frame changed unexpectedly: ${JSON.stringify(rightVertical)}`)
}
