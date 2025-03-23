import React, { useEffect, useReducer, useRef, useState } from 'react'

import { register } from 'ol/proj/proj4'
import * as projx from 'proj4'
const proj4 = (projx as any).default

import OLMap from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM'
import TileWMS from 'ol/source/TileWMS'

import * as olProj from 'ol/proj'
import { NodeModel } from '../models/Node'
import { VizItem } from '../types'
import { GraphModel } from '../models/Graph'
import { GraphEventHandlerModel } from '../GraphVisualizer/Graph/GraphEventHandlerModel'
import { Collection, Feature } from 'ol'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { Geometry } from 'ol/geom'
import { GeoJSON } from 'ol/format'
import Style from 'ol/style/Style'
import Fill from 'ol/style/Fill'
import Stroke from 'ol/style/Stroke'
import {
  IdFeaturePair,
  getOrLoadFeaturesFromWKTOrURL,
  parseGeoJson
} from './feature_loading'
import {
  createVectorLayer,
  VectorLayerContent,
  syncVectorLayer,
  clearVectorLayerContent
} from './VectorLayer'
import {
  createSelectLayer,
  SelectLayerContent,
  handleSelectClick,
  syncSelectLayer,
  FeatureSelectListener,
  closeSelectionPopup
} from './SelectLayer'
import { selectNodeById } from './map_to_graph'
import { RelationshipModel } from '../models/Relationship'
import { DATA_LAYERS } from '../config'

export type MapParentPlainProps = {
  mapPosition: [number, number]
  syncGraphWithMap(
    zoom: number,
    zoomDetailLevel: number,
    bounds: any,
    versionId: string
  ): void
  selectedItem: VizItem
  graph?: GraphModel
  geh?: GraphEventHandlerModel
  auStyle: 'bundeslaender' | 'bezirke' | 'gemeinden'
  versionId: string
  syncWithGraph: boolean
  syncWithMap: boolean
  limitGraphToMapBounds: boolean
}

function updateGraph(props: MapParentPlainProps, map?: OLMap) {
  if (map) {
    const view = map.getView()
    const extent = view.calculateExtent(map.getSize())
    const zoom = view.getZoom() ?? 0
    const extentTransformed = olProj.transformExtent(
      extent,
      view.getProjection(),
      'EPSG:4326'
    )
    props.syncGraphWithMap(zoom, 14, extentTransformed, props.versionId)
  }
}

export function MapParentPlain(props: MapParentPlainProps) {
  useEffect(registerProjections, [])

  const currentProps = useRef(props)
  currentProps.current = props

  const [_, forceUpdate] = useReducer(x => x + 1, 0)

  const featureCache = useRef(new Map<string, Feature<Geometry> | null>())
  const visibleFeatures = useRef<VectorLayerContent>({
    visibleFeatures: new Map<string, Feature<Geometry>>(),
    visibleFeatureCollection: new Collection<Feature<Geometry>>()
  })
  const selection = useRef<SelectLayerContent>({
    selectedFeature: null,
    selectedFeatureCollection: new Collection<Feature<Geometry>>()
  })

  const mapTargetElement = useRef<HTMLDivElement>(null)
  const popupTargetElement = useRef<HTMLDivElement>(null)
  const popupContentElement = useRef<HTMLDivElement>(null)

  const [map, setMap] = useState<OLMap | undefined>()
  const [auLayer, setAuLayer] = useState<TileLayer<TileWMS> | undefined>()

  const lastMapSelectedNode = useRef<NodeModel | null>(null)

  // sync react props with map state (visible features & selection)
  if (map) {
    syncSelectLayer(
      map,
      featureCache.current,
      selection.current,
      forceUpdate,
      props.selectedItem
    )
    syncVectorLayer(
      map,
      featureCache.current,
      visibleFeatures.current,
      props.syncWithGraph,
      forceUpdate,
      props.graph
    )
  }

  useEffect(() => {
    if (lastMapSelectedNode.current !== props.selectedItem.item && map) {
      closeSelectionPopup(map)
    }
  }, [props.selectedItem])

  useEffect(() => {
    const view = new View({
      center: props.mapPosition,
      projection: 'EPSG:3035', //TODO - warum
      zoom: 6,
      minZoom: 0,
      maxZoom: 28
    })

    const vectorLayer = createVectorLayer(
      visibleFeatures.current.visibleFeatureCollection
    )
    const selectLayer = createSelectLayer(
      selection.current.selectedFeatureCollection
    )

    const osmLayer = new TileLayer({
      source: new OSM(),
      zIndex: 0
    })

    const map = new OLMap({
      layers: [osmLayer, vectorLayer, selectLayer],
      controls: [],
      view: view
    })

    view.on('change', () => {
      if (
        currentProps.current.syncWithMap ||
        currentProps.current.limitGraphToMapBounds
      ) {
        updateGraph(currentProps.current, map)
      }
    })

    map.on('singleclick', e => {
      if (currentProps.current.graph && currentProps.current.geh) {
        const featureSelected = (node: NodeModel) => {
          lastMapSelectedNode.current = node
          forceUpdate()
        }

        handleSelectClick(
          e,
          featureCache.current,
          psLayers.current,
          forceUpdate,
          vectorLayer,
          currentProps.current.graph,
          currentProps.current.geh,
          featureSelected
        )
      }
    })

    map.setTarget(mapTargetElement.current || '')
    setMap(map)
    return () => map.setTarget('')
  }, [])

  useEffect(() => updateGraph(props, map), [props.versionId])

  useEffect(() => {
    if (auLayer) {
      map?.removeLayer(auLayer)
    }

    const newAuLayer = new TileLayer({
      source: new TileWMS({
        url: 'https://geoserver-admin.rest-gdi.geo-data.space/geoserver/au/wms?service=WMS',
        params: {
          LAYERS: 'au:AdministrativUnits',
          TILED: true,
          STYLES: props.auStyle,
          VERSION: '1.1.1'
        },
        projection: 'EPSG:4326',
        serverType: 'geoserver',
        transition: 0
      })
    })

    setAuLayer(newAuLayer)
    map?.addLayer(newAuLayer)
  }, [props.auStyle, props.versionId, map])

  const psLayers = useRef<TileLayer<TileWMS>[]>([])
  useEffect(() => {
    if (map) {
      if (props.syncWithGraph) {
        psLayers.current.forEach(layer => map.removeLayer(layer))
        psLayers.current = []
      } else {
        psLayers.current.forEach(layer => map.removeLayer(layer))
        psLayers.current = []
        for (const layer of DATA_LAYERS) {
          const dataLayer = new TileLayer({
            source: new TileWMS({
              url: layer.WMS_URL,
              params: {
                LAYERS: layer.LAYERS,
                TILED: true,
                VERSION: '1.1.1',
                CQL_FILTER: props.versionId
                  ? `versionId='${props.versionId}'`
                  : undefined
              },
              serverType: 'geoserver',
              projection: layer.PROJECTION,
              transition: 0
            }),
            zIndex: 1
          })

          psLayers.current.push(dataLayer)
          map.addLayer(dataLayer)
        }
      }
    }
  }, [props.syncWithGraph, props.syncGraphWithMap, props.versionId, map])

  // Set map center according to currently selected graph node
  useEffect(() => {
    const selItem = currentProps.current.selectedItem
    if (map && selItem && selItem.type === 'node') {
      const node = selItem.item as NodeModel

      if (node !== lastMapSelectedNode.current) {
        const bbox: number[] = []
        try {
          bbox.push(parseFloat(node.propertyMap['x_min'])),
            bbox.push(parseFloat(node.propertyMap['y_min'])),
            bbox.push(parseFloat(node.propertyMap['x_max'])),
            bbox.push(parseFloat(node.propertyMap['y_max']))
        } catch (e) {}

        if (bbox.filter(coord => !Number.isNaN(coord)).length === 4) {
          const center = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]

          const centerView = olProj.transform(
            center,
            'EPSG:4326',
            map.getView().getProjection()
          )

          map.getView().setCenter(centerView)
        }
      }
    }
  }, [props.syncWithGraph, props.syncGraphWithMap, props.selectedItem])

  return (
    <>
      <div
        ref={mapTargetElement}
        className="map"
        style={{
          width: '100%',
          height: '100%',
          position: 'relative'
        }}
      ></div>
      <div ref={popupTargetElement} id="popup" className="ol-popup">
        <a href="#" id="popup-closer" className="ol-popup-closer"></a>
        <div ref={popupContentElement} id="popup-content"></div>
      </div>
    </>
  )
}

function registerProjections() {
  proj4.defs(
    'EPSG:31287',
    '+proj=lcc +axis=neu +lat_0=47.5 +lon_0=13.3333333333333 +lat_1=49 +lat_2=46 +x_0=400000 +y_0=400000 +ellps=bessel +towgs84=577.326,90.129,463.919,5.137,1.474,5.297,2.42319999999019 +units=m +no_defs +type=crs'
  )
  proj4.defs(
    'EPSG:31258',
    '+proj=tmerc +lat_0=0 +lon_0=13.3333333333333 +k=1 +x_0=450000 +y_0=-5000000 +ellps=bessel +towgs84=577.326,90.129,463.919,5.137,1.474,5.297,2.4232 +units=m +no_defs +type=crs'
  )
  proj4.defs(
    'EPSG:3035',
    '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs'
  )
  proj4.defs(
    'EPSG:3857',
    '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs'
  )
  proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs +type=crs')

  register(proj4)
}
