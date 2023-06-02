import React, { useState } from 'react'

export type SyncPanelProps = {
  syncWithMapBounds: boolean
  syncWithGraph: boolean
  syncOptionsChanged: (
    syncWithMapBound: boolean,
    syncWithGraph: boolean
  ) => void
  layers: string[]
  hiddenLayersChanged: (layers: string[]) => void
}

export function SyncPanel(props: SyncPanelProps) {
  const [hiddenLayers, setHiddenLayers] = useState(new Set(props.layers))

  const layers = props.layers.map(layerName => (
    <label key={layerName} style={{ flexBasis: '100%' }}>
      <input
        type="checkbox"
        checked={!hiddenLayers.has(layerName)}
        onChange={value => {
          const newSet = new Set(hiddenLayers)
          if (!value.target.checked) {
            newSet.add(layerName)
          } else {
            newSet.delete(layerName)
          }
          setHiddenLayers(newSet)

          props.hiddenLayersChanged(props.layers.filter(l => newSet.has(l)))
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
      Layers:
      {layers}
    </div>
  )
}
