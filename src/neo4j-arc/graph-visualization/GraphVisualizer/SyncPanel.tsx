import React, { useState } from 'react'
import { VERSIONIDS } from '../config'

export type AuStyle = 'bundeslaender' | 'bezirke' | 'gemeinden'

export type SyncPanelProps = {
  syncWithMapBounds: boolean
  syncWithGraph: boolean
  limitGraphToMapBounds: boolean
  syncOptionsChanged: (
    syncWithMapBound: boolean,
    syncWithGraph: boolean,
    limitGraphToMapBounds: boolean
  ) => void
  // layers: string[]
  bgLayerChanged: (layer: AuStyle) => void
  versionChanged: (versionid: string) => void
}

export function SyncPanel(props: SyncPanelProps) {
  const [shownLayer, setShownLayer] = useState<AuStyle>('bezirke')
  props.bgLayerChanged(shownLayer)

  const layers = ['bundeslaender', 'bezirke', 'gemeinden'].map(layerName => (
    <label key={layerName} style={{ flexBasis: '100%' }}>
      <input
        type="checkbox"
        checked={shownLayer == layerName}
        onChange={() => {
          setShownLayer(layerName as AuStyle)
          props.bgLayerChanged(layerName as AuStyle)
        }}
      />
      {layerName}
    </label>
  ))

  let versionSelect = <></>
  const versionOptions = VERSIONIDS.map(val => (
    <option key={val} value={val}>
      {val}
    </option>
  ))
  if (versionOptions.length > 0) {
    versionOptions.push(
      <option key={''} value={''}>
        Keine
      </option>
    )

    versionSelect = (
      <select
        defaultValue={VERSIONIDS[VERSIONIDS.length - 1]}
        onChange={e => props.versionChanged(e.target.value)}
      >
        {versionOptions}
      </select>
    )
  }

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
            props.syncOptionsChanged(
              value.target.checked,
              false,
              props.limitGraphToMapBounds
            )
          }
        />
        Karte ist Master
      </label>
      <label style={{ flexBasis: '100%' }}>
        <input
          type="checkbox"
          checked={props.syncWithGraph}
          onChange={value =>
            props.syncOptionsChanged(
              false,
              value.target.checked,
              props.limitGraphToMapBounds
            )
          }
        />
        Graph ist Master
      </label>
      {/* <label style={{ flexBasis: '100%' }}>
        <input
          type="checkbox"
          checked={props.limitGraphToMapBounds}
          onChange={value =>
            props.syncOptionsChanged(props.syncWithMapBounds, props.syncWithGraph, value.target.checked)
          }
        />
        Limit Query Result to Map Bounding-Box
      </label> */}
      {versionSelect}
      Verwaltungsgrundkarte:
      {layers}
    </div>
  )
}
