/**
 * Shared pane-tree content restore — fetches each tab's file content and
 * delivers it to the pane that owns it, closing tabs whose vault/file is gone.
 *
 * Extracted from `useWorkspaceRestore` so session restore AND workspace loading
 * use one implementation and cannot drift (workspaces spec, Task 6). Pure of
 * React: the caller passes the live tree, the pane dispatch, the api client, the
 * set of valid vault ids, and an `isMounted` guard so a late fetch resolving
 * after unmount (or after the user switched away) does not dispatch into a
 * stale tree.
 *
 * @module state/paneTreeRestore
 */

import type { Dispatch } from 'react'
import type { IApiClient } from '../api'
import { listPanes, type PaneTree, type PaneTreeAction } from './paneTreeState'

/**
 * For every tab in `paneTree`: a tab whose vault is not in `validVaultIds` is
 * closed; a virtual (`__…`) tab is marked loaded with empty content; a real file
 * tab has its content fetched and delivered, or is closed if the fetch fails.
 */
export function fetchPaneTreeContent(
  paneTree: PaneTree,
  paneTreeDispatch: Dispatch<PaneTreeAction>,
  apiClient: IApiClient,
  validVaultIds: ReadonlySet<string>,
  isMounted: () => boolean,
): void {
  for (const pane of listPanes(paneTree)) {
    for (const tab of pane.tabState.tabs) {
      const tabId = tab.id
      if (!validVaultIds.has(tab.vaultId)) {
        paneTreeDispatch({
          type: 'PANE_TAB_ACTION',
          payload: { paneId: pane.id, action: { type: 'CLOSE_TAB', payload: { tabId } } },
        })
        continue
      }
      // Virtual tabs (graph, plugin views, web viewer) carry no file content.
      if (tab.filePath.startsWith('__')) {
        paneTreeDispatch({
          type: 'PANE_TAB_ACTION',
          payload: {
            paneId: pane.id,
            action: { type: 'TAB_CONTENT_LOADED', payload: { tabId, content: '', isBinary: false } },
          },
        })
        continue
      }
      apiClient.fetchFileContent(tab.vaultId, tab.filePath).then(
        (result) => {
          if (!isMounted()) return
          paneTreeDispatch({
            type: 'PANE_TAB_ACTION',
            payload: {
              paneId: pane.id,
              action: {
                type: 'TAB_CONTENT_LOADED',
                payload: { tabId, content: result.content, isBinary: result.isBinary },
              },
            },
          })
        },
        () => {
          if (!isMounted()) return
          // File no longer exists — close the tab in its pane (R5: skip, keep the rest).
          paneTreeDispatch({
            type: 'PANE_TAB_ACTION',
            payload: { paneId: pane.id, action: { type: 'CLOSE_TAB', payload: { tabId } } },
          })
        },
      )
    }
  }
}
