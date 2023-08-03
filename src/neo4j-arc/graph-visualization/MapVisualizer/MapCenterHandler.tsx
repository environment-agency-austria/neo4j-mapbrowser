import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import { VizItem } from '../types'
import { calcMapCenterFromVizItem } from './graph_to_map'

function MapCenterHandler(props: {
  selectedItem?: VizItem
  syncWithGraph: boolean
}) {
  if (props.syncWithGraph && props.selectedItem) {
    const mapCenter = calcMapCenterFromVizItem(props.selectedItem)

    if (mapCenter) {
      const map = useMap()
      useEffect(() => {
        if (
          Math.round(map.getCenter().lat * 100) / 100 !==
          Math.round(mapCenter[0] * 100) / 100
        ) {
          console.log(
            JSON.stringify({ lat: mapCenter[0], lng: mapCenter[1] }) +
              '; ' +
              JSON.stringify(map.getCenter())
          )
          map.setView({ lat: mapCenter[0], lng: mapCenter[1] })
        }
      }, [mapCenter, map])
    }
  }

  return null
}

export { MapCenterHandler }
