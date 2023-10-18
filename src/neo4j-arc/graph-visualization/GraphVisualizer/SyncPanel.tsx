import React, { useState } from 'react'

export type AuStyle = 'bundeslaender' | 'bezirke' | 'gemeinden'

export type SyncPanelProps = {
  syncWithMapBounds: boolean
  syncWithGraph: boolean
  syncOptionsChanged: (
    syncWithMapBound: boolean,
    syncWithGraph: boolean
  ) => void
  layers: string[]
  layerChanged: (layer: AuStyle) => void
}

export function SyncPanel(props: SyncPanelProps) {
  const [shownLayer, setShownLayer] = useState<AuStyle>('bezirke')
  props.layerChanged(shownLayer)

  const layers = ['bundeslaender', 'bezirke', 'gemeinden'].map(layerName => (
    <label key={layerName} style={{ flexBasis: '100%' }}>
      <input
        type="checkbox"
        checked={shownLayer == layerName}
        onChange={() => {
          setShownLayer(layerName as AuStyle)
          props.layerChanged(layerName as AuStyle)
        }}
      />
      {layerName}
    </label>
  ))

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
      Verwaltungsgrundkarte:
      {layers}
    </div>
  )
}
