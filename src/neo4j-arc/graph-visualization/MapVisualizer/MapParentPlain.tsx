import React, { useEffect, useReducer, useRef, useState } from 'react'

import { register } from 'ol/proj/proj4'
import * as projx from 'proj4'
const proj4 = (projx as any).default

import OLMap from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM'
import TileWMS from 'ol/source/TileWMS'
import WMSGetFeatureInfo from 'ol/format/WMSGetFeatureInfo'

import * as olProj from 'ol/proj'
import { NodeModel } from '../models/Node'
import { VizItem } from '../types'
import { GraphModel } from '../models/Graph'
import { GraphEventHandlerModel } from '../GraphVisualizer/Graph/GraphEventHandlerModel'
import { fetchFeaturesFromGmlURL } from './fetch_features'
import { Collection, Feature } from 'ol'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { Geometry } from 'ol/geom'
import { WFS, GeoJSON } from 'ol/format'
import GML32 from 'ol/format/GML32'
import { FeatureCollection } from 'geojson'
import Style from 'ol/style/Style'
import Fill from 'ol/style/Fill'
import Stroke from 'ol/style/Stroke'

export type MapParentPlainProps = {
  mapPosition: [number, number]
  syncGraphWithMap(zoom: number, zoomDetailLevel: number, bounds: any): void
  selectedItem: VizItem
  graph?: GraphModel
  geh?: GraphEventHandlerModel
  auStyle: 'bundeslaender' | 'bezirke' | 'gemeinden'
  syncWithGraph: boolean
}

type IdFeaturePair = { id: string; feature: Feature<Geometry> } | null

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
    '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=565.04,49.91,465.84,1.9848,-1.7439,9.0587,4.0772 +units=m +no_defs +type=crs'
  )
  register(proj4)
}

function getGmlUrlFromNode(node: NodeModel) {
  return node.propertyList.find(p => p.key === 'gml:identifer')?.value
}

// asynchronously loads a single feature
async function loadFeature(
  gmlUri: string,
  targetProjection: olProj.Projection
): Promise<IdFeaturePair> {
  if (gmlUri) {
    const selIdWithFormat = gmlUri + '?outputFormat=application/json'
    const fetchPromise = fetch(selIdWithFormat)
      .then(response => response.text())
      .then(txt => {
        const featureCollection = new GeoJSON().readFeatures(txt, {
          dataProjection: 'EPSG:3035',
          featureProjection: targetProjection
        })
        return { id: gmlUri, feature: featureCollection[0] }
      })

    // @ts-ignore
    return fetchPromise
  } else {
    return Promise.resolve(null)
  }
}

function loadUncachedFeatures(
  cache: Map<string, Feature<Geometry> | null>,
  gmlUris: string[],
  targetProjection: olProj.Projection,
  featureLoadedCB: (ft: IdFeaturePair) => void
) {
  // considere only features not already contained in the cache
  const allLoads = gmlUris.filter(uri => !cache.has(uri))
  const pendingLoads = new Set<string>(allLoads)
  // mark all non-existent urls as currently loading (feature = null)
  // so no futher attempts are made to load this multiple times
  allLoads.forEach(uri => cache.set(uri, null))

  function loadUri(uri: string): Promise<any> {
    pendingLoads.delete(uri)
    const featurePromise = loadFeature(uri, targetProjection)
    return featurePromise.then(ft => {
      if (ft) {
        cache.set(uri, ft.feature)
        featureLoadedCB(ft)
      }

      if (pendingLoads.size > 0) {
        return loadUri(pendingLoads.values().next().value)
      } else {
        return ft
      }
    })
  }

  // Fetch the first PARALLEL_FETCH_COUNT requests, once finished each request
  // will begin to initiate another fetch again until all open requests (pendingLoads)
  // are fulfilled.
  const PARALLEL_FETCH_COUNT = 10
  for (let i = 0; i < Math.min(PARALLEL_FETCH_COUNT, allLoads.length); i++) {
    loadUri(allLoads[i])
  }
}

export function MapParentPlain(props: MapParentPlainProps) {
  useEffect(registerProjections, [])

  const currentProps = useRef(props)
  currentProps.current = props

  const [_, forceUpdate] = useReducer(x => x + 1, 0)
  const featureCache = useRef(new Map<string, Feature<Geometry> | null>())
  const selectedFeature = useRef<IdFeaturePair | null>(null)
  const selectedFeatureCollection = useRef(new Collection<Feature<Geometry>>())

  const visibleFeatures = useRef(new Map<string, Feature<Geometry>>())
  const visibleFeatureCollection = useRef(new Collection<Feature<Geometry>>())

  const mapTargetElement = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<OLMap | undefined>()
  const [auLayer, setAuLayer] = useState<TileLayer<TileWMS> | undefined>()

  // selected node handling
  if (map && props.selectedItem && props.selectedItem.type === 'node') {
    const gmlUri = getGmlUrlFromNode(props.selectedItem.item as NodeModel)

    if (gmlUri) {
      loadUncachedFeatures(
        featureCache.current,
        [gmlUri],
        map.getView().getProjection(),
        () => forceUpdate()
      )

      if (
        selectedFeature.current == null ||
        selectedFeature.current.id != gmlUri
      ) {
        selectedFeatureCollection.current.clear()

        const feature = featureCache.current.get(gmlUri)
        if (feature) {
          selectedFeatureCollection.current.push(feature)
          selectedFeature.current = { id: gmlUri, feature: feature }
        } else {
          selectedFeature.current = null
        }
      }
    }
  } else {
    selectedFeatureCollection.current.clear()
    selectedFeature.current = null
  }

  // vector nodes handling
  if (props.syncWithGraph && props.graph && map) {
    const nodeURLs = props.graph
      .nodes()
      .filter(n => n.propertyMap['gml:identifier'])
      .map(n => ({ url: n.propertyMap['gml:identifier'], layers: n.labels }))

    //make sure all features are loaded into cache
    loadUncachedFeatures(
      featureCache.current,
      nodeURLs.map(nu => nu.url),
      map.getView().getProjection(),
      () => forceUpdate()
    )

    // add/remove features from vector layer
    const urlsToShow = new Set(nodeURLs.map(nu => nu.url))
    const featuresToRemove = Array.from(visibleFeatures.current.keys()).filter(
      url => !urlsToShow.has(url)
    )
    if (featuresToRemove.length > 0) {
      visibleFeatureCollection.current.clear()
      visibleFeatures.current.clear()
    }
    const featuresToAdd = nodeURLs.filter(
      nu => !visibleFeatures.current.has(nu.url)
    )
    featuresToAdd.forEach(url => {
      const feature = featureCache.current.get(url.url)
      if (feature) {
        visibleFeatures.current.set(url.url, feature)
        visibleFeatureCollection.current.push(feature)
      }
    })
  } else {
    visibleFeatureCollection.current.clear()
    visibleFeatures.current.clear()
  }

  useEffect(() => {
    const view = new View({
      center: props.mapPosition,
      projection: 'EPSG:3035',
      zoom: 6,
      minZoom: 0,
      maxZoom: 28
    })

    const vectorLayer = new VectorLayer({
      source: new VectorSource({
        features: visibleFeatureCollection.current
      }),
      zIndex: 2
    })

    const selectLayer = new VectorLayer({
      source: new VectorSource({
        features: selectedFeatureCollection.current
      }),
      zIndex: 3,
      style: new Style({
        fill: new Fill({
          color: 'red'
        }),
        stroke: new Stroke({
          color: 'black'
        })
      })
    })

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
      const extent = view.calculateExtent(map.getSize())
      const zoom = view.getZoom() ?? 0
      // 'EPSG:31287'

      const extentTransformed = olProj.transformExtent(
        extent,
        view.getProjection(),
        'EPSG:3035'
      )

      props.syncGraphWithMap(zoom, 10, extentTransformed)
    })

    map.on('singleclick', e => {
      const viewResolution = view.getResolution() ?? 0

      function selectNodeById(selid: string) {
        if (selid && currentProps.current.graph && currentProps.current.geh) {
          const selectedNode = currentProps.current.graph
            .nodes()
            .find(n =>
              n.propertyList.find(p => p.key === 'gml:id' && p.value === selid)
            )
          if (selectedNode) {
            currentProps.current.geh.selectItem(selectedNode)
            currentProps.current.geh.onItemSelected({
              type: 'node',
              item: selectedNode
            })
            forceUpdate()
          }
        }
      }

      if (psLayer.current) {
        const url = psLayer.current
          .getSource()
          ?.getFeatureInfoUrl(
            e.coordinate,
            viewResolution,
            map.getView().getProjection(),
            {
              INFO_FORMAT: 'text/plain'
            }
          )
        if (url) {
          fetch(url)
            .then(response => response.text())
            .then(txt => {
              const idPos = txt.indexOf('id=') + 3
              const startTrimmed = txt.substring(idPos)
              const id = startTrimmed.substring(0, startTrimmed.indexOf('>'))
              selectNodeById(id)
            })
        }
      } else {
        const allFeatures = map.getFeaturesAtPixel(e.pixel)
        const vectorIds = allFeatures
          .map(node => node.getId())
          .filter(id => typeof id === 'string')
          .map(id => id as string)
          .filter(id => id.indexOf('ProtectedSite') > -1)

        //TODO: Handle multiple layers
        if (vectorIds.length > 0) {
          selectNodeById(vectorIds[0])
        }
      }
    })

    map.setTarget(mapTargetElement.current || '')
    setMap(map)
    return () => map.setTarget('')
  }, [])

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
        projection: 'EPSG:3035',
        serverType: 'geoserver',
        transition: 0
      })
    })

    setAuLayer(newAuLayer)
    map?.addLayer(newAuLayer)
  }, [props.auStyle, map])

  const psLayer = useRef<TileLayer<TileWMS> | null>(null)
  useEffect(() => {
    if (map) {
      if (props.syncWithGraph) {
        if (psLayer.current) {
          map.removeLayer(psLayer.current)
          psLayer.current = null
        }
      } else {
        psLayer.current = new TileLayer({
          source: new TileWMS({
            url: 'https://geoserver2-admin.rest-gdi.geo-data.space/geoserver/ps/wms?service=WMS',
            params: {
              LAYERS: 'ps:ProtectedSite',
              TILED: true,
              VERSION: '1.1.1'
            },
            serverType: 'geoserver',
            transition: 0
          }),
          zIndex: 1
        })

        map.addLayer(psLayer.current)
      }
    }
  }, [props.syncWithGraph, props.syncGraphWithMap, map])

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
    </>
  )
}
