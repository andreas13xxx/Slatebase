import type { TabMode } from '../state/tabState'

/** Modes a `.base` tab toggles between from the breadcrumb: the rendered view and its YAML source. */
export const BASE_BREADCRUMB_MODES: ReadonlyArray<TabMode> = ['reading', 'source']
