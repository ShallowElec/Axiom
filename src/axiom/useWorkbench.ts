import { useSyncExternalStore } from 'react';
import type { WorkbenchStore } from '../runtime/workbench-store.js';
import type { WorkbenchState } from '../runtime/types.js';

export function useWorkbench(store: WorkbenchStore): WorkbenchState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
