import { useMapEvents } from 'react-leaflet'

type BoundingBoxChangeProps = {
  onBoundsChanged: (bounds: any) => void
  onZoomChange: (zoom: number) => void
}

function BoundingBoxHandler(props: BoundingBoxChangeProps) {
  const mapEvents = useMapEvents({
    zoomend: (e: any) => {
      console.log(e)
      props.onZoomChange(mapEvents.getZoom())
    },
    moveend: () => {
      props.onBoundsChanged(mapEvents.getBounds())
    }
  })

  return null
}

export { BoundingBoxHandler }
