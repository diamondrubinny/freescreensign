// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { useCallback, useReducer } from 'react';

interface State<T> {
  past: T[];
  present: T;
  future: T[];
  /** Snapshot taken when a gesture (drag, typing) started; committed once at its end. */
  pending: T | null;
}

type Action<T> =
  | { type: 'set'; value: T; transient: boolean }
  | { type: 'commit' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset'; value: T };

const LIMIT = 100;

function reducer<T>(state: State<T>, action: Action<T>): State<T> {
  switch (action.type) {
    case 'set':
      if (action.transient) {
        return { ...state, present: action.value, pending: state.pending ?? state.present };
      }
      return {
        past: [...state.past, state.pending ?? state.present].slice(-LIMIT),
        present: action.value,
        future: [],
        pending: null,
      };
    case 'commit':
      if (!state.pending) return state;
      return {
        past: [...state.past, state.pending].slice(-LIMIT),
        present: state.present,
        future: [],
        pending: null,
      };
    case 'undo': {
      const previous = state.past.at(-1);
      if (previous === undefined) return state;
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
        pending: null,
      };
    }
    case 'redo': {
      const [next, ...rest] = state.future;
      if (next === undefined) return state;
      return { past: [...state.past, state.present], present: next, future: rest, pending: null };
    }
    case 'reset':
      return { past: [], present: action.value, future: [], pending: null };
  }
}

/** Undo/redo history. Transient updates (during a drag) become one step on commit. */
export function useHistory<T>(initial: T) {
  const [state, dispatch] = useReducer(reducer<T>, {
    past: [],
    present: initial,
    future: [],
    pending: null,
  });
  return {
    value: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    set: useCallback((value: T, transient = false) => {
      dispatch({ type: 'set', value, transient });
    }, []),
    commit: useCallback(() => {
      dispatch({ type: 'commit' });
    }, []),
    undo: useCallback(() => {
      dispatch({ type: 'undo' });
    }, []),
    redo: useCallback(() => {
      dispatch({ type: 'redo' });
    }, []),
    reset: useCallback((value: T) => {
      dispatch({ type: 'reset', value });
    }, []),
  };
}
