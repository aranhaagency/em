/** Defines global keyboard shortcuts and gestures. */

import { isMac } from './browser.js'
import { store } from './store.js'
import globals from './globals.js'
import createAlert from './action-creators/alert.js'

import Emitter from 'emitter20'

// constants
import {
  GESTURE_SEGMENT_HINT_TIMEOUT,
  SUPPRESS_EXPANSION_DELAY,
} from './constants.js'

import * as shortcutObject from './shortcuts/index.js'
export const globalShortcuts = Object.values(shortcutObject)

export const ShortcutEmitter = new Emitter()

let timerMeta = null // eslint-disable-line fp/no-let

/* Hash all the properties of a shortcut into a string */
const hashShortcut = shortcut =>
  (shortcut.keyboard.meta ? 'meta_' : '') +
  (shortcut.keyboard.alt ? 'alt_' : '') +
  (shortcut.keyboard.shift ? 'shift_' : '') +
  (shortcut.keyboard.key || shortcut.keyboard).toLowerCase()

/* Hash all the properties of a keydown event into a string that matches hashShortcut */
const hashKeyDown = e =>
  (e.metaKey || e.ctrlKey ? 'meta_' : '') +
  (e.altKey ? 'alt_' : '') +
  (e.shiftKey ? 'shift_' : '') +
  e.key.toLowerCase()

// index shortcuts for O(1) lookup by keyboard
const shortcutKeyIndex = globalShortcuts.reduce((accum, shortcut) => shortcut.keyboard
  ? {
    ...accum,
    [hashShortcut(shortcut)]: shortcut
  }
  : accum,
  {}
)

// index shortcuts for O(1) lookup by id
const shortcutIdIndex = globalShortcuts.reduce((accum, shortcut) => shortcut.id
  ? {
    ...accum,
    [shortcut.id]: shortcut
  }
  : accum,
  {}
)

// index shortcuts for O(1) lookup by gesture
const shortcutGestureIndex = globalShortcuts.reduce((accum, shortcut) => shortcut.gesture
  ? {
    ...accum,
    // flatten gesture aliases
    ...[].concat(shortcut.gesture)
      .reduce((accumInner, gesture) => ({
        ...accumInner,
        [gesture]: shortcut
      }), {})
  }
  : accum,
  {}
)

let handleGestureSegmentTimeout // eslint-disable-line fp/no-let

export const handleGestureSegment = (g, sequence, e) => {

  const state = store.getState()
  const { toolbarOverlay, scrollPrioritized } = state

  if (toolbarOverlay || scrollPrioritized) return

  // disable when modal is displayed or a drag is in progress
  if (state.showModal || state.dragInProgress) return

  const shortcut = shortcutGestureIndex[sequence]

  // display gesture hint
  clearTimeout(handleGestureSegmentTimeout)
  handleGestureSegmentTimeout = setTimeout(
    () => {
      // only show "Invalid gesture" if hint is already being shown
      createAlert(shortcut ? shortcut.name
        : state.alert ? '✗ Invalid gesture'
          : null)
    },
    // if the hint is already being shown, do not wait to change the value
    state.alert ? 0 : GESTURE_SEGMENT_HINT_TIMEOUT
  )
}

export const handleGestureEnd = (gesture, e) => {
  const state = store.getState()
  const { scrollPrioritized } = state

  if (scrollPrioritized) return

  // disable when modal is displayed or a drag is in progress
  if (gesture && !state.showModal && !state.dragInProgress) {
    const shortcut = shortcutGestureIndex[gesture]
    if (shortcut) {
      shortcut.exec(e, { type: 'gesture' })
    }
  }

  // clear gesture hint
  clearTimeout(handleGestureSegmentTimeout)
  handleGestureSegmentTimeout = null // null the timer to track when it is running for handleGestureSegment

  // needs to be delayed until the next tick otherwise there is a re-render which inadvertantly calls the automatic render focus in the Thought component.
  setTimeout(() => createAlert(null))
}

/** Global keyUp handler */
export const keyUp = e => {
  // track meta key for expansion algorithm
  if (e.key === (isMac ? 'Meta' : 'Control')) {
    globals.suppressExpansion = false
    clearTimeout(timerMeta)
    // trigger re-expansion
    store.dispatch({ type: 'setCursor', thoughtsRanked: store.getState().cursor })
  }
}

/** Global keyDown handler */
export const keyDown = e => {
  const state = store.getState()
  const { toolbarOverlay, scrollPrioritized } = state

  clearTimeout(timerMeta)

  // track meta key for expansion algorithm
  if (e.key === (isMac ? 'Meta' : 'Control')) {
    timerMeta = setTimeout(() => {
      globals.suppressExpansion = true
      // trigger re-expansion
      store.dispatch({ type: 'setCursor', thoughtsRanked: store.getState().cursor })
    }, SUPPRESS_EXPANSION_DELAY)
  }
  else {
    globals.suppressExpansion = false
  }

  if (toolbarOverlay || scrollPrioritized) return

  // disable when welcome, shortcuts, or feeback modals are displayed
  if (state.showModal === 'welcome' || state.showModal === 'help' || state.showModal === 'feedback') return

  const shortcut = shortcutKeyIndex[hashKeyDown(e)]

  // execute the shortcut if it exists
  if (shortcut) {
    ShortcutEmitter.trigger('shortcut')
    // preventDefault by default, unless e.allowDefault() is called
    if (!shortcut.canExecute || shortcut.canExecute(e)) {
      e.preventDefault()
      shortcut.exec(e, { type: 'keyboard' })
    }
  }
}

/** Converts a gesture letter or event key of an arrow key to an arrow utf8 character. Defaults to input. */
const arrowTextToArrowCharacter = str => ({
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓'
}[str] || str)

export const formatKeyboardShortcut = keyboard => {
  const key = keyboard.key || keyboard
  return (keyboard.meta ? (isMac ? 'Command' : 'Ctrl') + ' + ' : '') +
    (keyboard.control ? 'Control + ' : '') +
    (keyboard.option ? 'Option + ' : '') +
    (keyboard.shift ? 'Shift + ' : '') +
    arrowTextToArrowCharacter(keyboard.shift && key.length === 1 ? key.toUpperCase() : key)
}

export const shortcutById = id => shortcutIdIndex[id]
