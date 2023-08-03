import { GraphModel } from '../models/Graph'
import { FeatureCollection } from 'geojson'
import { GraphEventHandlerModel } from '../GraphVisualizer/Graph/GraphEventHandlerModel'

import { register } from 'ol/proj/proj4'
import * as proj4x from 'proj4'
import { Feature } from 'ol'
const proj4 = (proj4x as any).default

import React, { useState, useEffect, useRef, useReducer } from 'react'

import {
  MapContainer,
  TileLayer,
  GeoJSON,
  WMSTileLayer,
  LayersControl
} from 'react-leaflet'

import { BoundingBoxHandler } from './BoundingBoxHandler'
import { urlsToFeatureCollection, loadMissingMapData } from './fetch_features'
import { MapCenterHandler } from './MapCenterHandler'
import { VizItem } from '../types'
import { calcMapCenterFromVizItem } from './graph_to_map'

function initializeProj4() {
  useEffect(() => {
    proj4.defs(
      'EPSG:31287',
      '+proj=lcc +axis=neu +lat_0=47.5 +lon_0=13.3333333333333 +lat_1=49 +lat_2=46 +x_0=400000 +y_0=400000 +ellps=bessel +towgs84=577.326,90.129,463.919,5.137,1.474,5.297,2.42319999999019 +units=m +no_defs +type=crs'
    )
    register(proj4)
  }, [])
}

type MapParentProps = {
  zoomLevel: number
  nodeURLs: string[]
  graph?: GraphModel
  geh?: GraphEventHandlerModel
  selectedItem?: VizItem
  syncGraphWithMap(zoom: number, zoomDetailLevel: number, bounds: any): void
  position: [number, number]
  syncWithMap: boolean
  syncWithGraph: boolean
}

function MapParent(props: MapParentProps) {
  initializeProj4()

  /* state */
  const [selectedItem, setSelectedItem] = useState(props.geh?.selectedItem)
  if (selectedItem !== props.geh?.selectedItem) {
    setSelectedItem(props.geh?.selectedItem)
  }
  const [zoomLevel, setZoomLevel] = useState(8)
  const [bounds, setBounds] = useState<any>()
  const [_geodata, setGeoData] = useState<FeatureCollection>({
    type: 'FeatureCollection',
    features: []
  })
  const [shownURLs, setShownURLs] = useState(new Set<string>())
  const processedURLs = useRef(new Map<string, Feature | null>())
  const [ignored, forceUpdate] = useReducer(x => x + 1, 0)

  /* variables */
  const detailZoomLevel = 11
  const dataToShow = urlsToFeatureCollection(
    processedURLs.current,
    props.nodeURLs
  )
  const newURLs = JSON.stringify(Array.from(dataToShow.shownURLs))
  const oldURLs = JSON.stringify(Array.from(shownURLs))
  if (newURLs !== oldURLs) {
    setShownURLs(dataToShow.shownURLs)
    setGeoData(dataToShow.collection)
  }

  //Filter selected objects based on their ID - depending on the currently selected item
  const selectedGeoData = {
    type: 'FeatureCollection',
    features: []
  } as FeatureCollection
  if (selectedItem) {
    const selId = selectedItem.propertyList.find(p => p.key === 'gml:id')?.value
    selectedGeoData.features = _geodata.features.filter(f => f.id === selId)
  }

  // Handle click on Layer
  const layerClickHandler = (feature: any, layer: any) => {
    layer.on('click', () => {
      const gmlId = feature.id

      if (props.graph && props.geh) {
        const selectedNode = props.graph
          .nodes()
          .find(n =>
            n.propertyList.find(p => p.key === 'gml:id' && p.value === gmlId)
          )
        if (selectedNode) {
          props.geh.selectItem(selectedNode)
          setSelectedItem(selectedNode)
        }
      }
      return null
    })
  }

  console.log(JSON.stringify(props.position))

  useEffect(() => {
    if (zoomLevel < detailZoomLevel && !props.syncWithGraph) {
      return
    }

    loadMissingMapData(processedURLs.current, props.nodeURLs).then(
      newFeaturesLoaded => {
        if (newFeaturesLoaded) {
          forceUpdate()
        }
      }
    )
  })

  const onMapZoomChange = (zoom: number) => {
    setZoomLevel(zoom)
    props.syncGraphWithMap(zoomLevel, detailZoomLevel, bounds)
  }

  const onMapBoundsChange = (bounds: any) => {
    setBounds(bounds)
    props.syncGraphWithMap(zoomLevel, detailZoomLevel, bounds)
  }

  let layer
  if (zoomLevel >= detailZoomLevel || props.syncWithGraph) {
    layer = (
      <GeoJSON
        key={Math.random()}
        data={_geodata}
        // @ts-expect-error
        onEachFeature={layerClickHandler}
        pathOptions={{ color: 'blue', weight: 1 }}
      />
    )
  } else if (props.syncWithMap) {
    layer = (
      <WMSTileLayer
        url="http://swwat.grillmayer.eu:8080/geoserver/ows?SERVICE=WMS&"
        params={{
          layers: 'swwat:GefahrenzonenPublic',
          transparent: true,
          format: 'image/png'
        }}
      />
    )
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      {/*zoomLevel*/}
      {zoomLevel}
      <MapContainer
        style={{ width: '100%', height: '100%', zIndex: 1 }}
        center={props.position} //only applied at creation
        zoom={zoomLevel}
        scrollWheelZoom={true}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <GeoJSON
          key={Math.random()}
          data={selectedGeoData}
          // @ts-expect-error
          onEachFeature={layerClickHandler}
          pathOptions={{ color: 'red', weight: 5 }}
        />
        <LayersControl>{layer}</LayersControl>
        <BoundingBoxHandler
          onZoomChange={onMapZoomChange}
          onBoundsChanged={onMapBoundsChange}
        />
        <MapCenterHandler
          selectedItem={props.selectedItem}
          syncWithGraph={props.syncWithGraph}
        />
      </MapContainer>
    </div>
  )
}

export { MapParent }
