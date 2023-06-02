import React from 'react'

export type SyncPanelProps = {
  syncWithMapBounds: boolean
  syncWithGraph: boolean
  syncOptionsChanged: (
    syncWithMapBound: boolean,
    syncWithGraph: boolean
  ) => void
}

export function SyncPanel(props: SyncPanelProps) {
  return (
    <div
      style={{
        background: 'silver',
        display: 'flex',
        flexDirection: 'column',
        rowGap: 5
      }}
    >
      <label style={{ flexBasis: '100%' }}>
        <input
          type="checkbox"
          checked={props.syncWithMapBounds}
          onChange={value =>
            props.syncOptionsChanged(value.target.checked, false)
          }
        />
        Sync Nodes with Map
      </label>
      <label style={{ flexBasis: '100%' }}>
        <input
          type="checkbox"
          checked={props.syncWithGraph}
          onChange={value =>
            props.syncOptionsChanged(false, value.target.checked)
          }
        />
        Sync Map with Nodes
      </label>
      <button title="blabla">Alle Knoten in Map anzeigen</button>
    </div>
  )
}
