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
import { GeoJSON, WKT } from 'ol/format'
import Style from 'ol/style/Style'
import Fill from 'ol/style/Fill'
import Stroke from 'ol/style/Stroke'
import { UrlLayerPair } from './graph_to_map'
import { GEOJSON_PROJ, GML_IDENTIFIER_KEY } from '../config'

const wktFormat = new WKT()

type IdFeaturePair = { id: string; feature: Feature<Geometry> } | null

function parseGeoJson(txt: string, targetProjection: olProj.Projection) {
  return new GeoJSON().readFeatures(txt, {
    dataProjection: GEOJSON_PROJ,
    featureProjection: targetProjection
  })
}

function loadFeatureFromWTK(
  uri: UrlLayerPair,
  targetProjection: olProj.Projection
): IdFeaturePair {
  const feature = wktFormat.readFeature(uri.wkt)
  feature.set(GML_IDENTIFIER_KEY, uri.url)
  const geometry = feature.getGeometry()
  if (geometry) {
    geometry.transform(GEOJSON_PROJ, targetProjection)
  }
  return { id: uri.url, feature: feature }
}

// asynchronously loads a single feature
async function loadFeatureFromGeoJsonURI(
  gmlUri: string,
  targetProjection: olProj.Projection
): Promise<IdFeaturePair> {
  if (gmlUri) {
    const selIdWithFormat = gmlUri + '?outputFormat=application/json'
    const fetchPromise = fetch(selIdWithFormat)
      .then(response => response.text())
      .then(txt => {
        try {
          const featureCollection = parseGeoJson(txt, targetProjection)
          /*if(featureCollection.length > 0 && featureCollection[0].getId()) {
            console.log("feature " +selIdWithFormat+ " loaded: " + featureCollection[0].getId())
          }*/
          return { id: gmlUri, feature: featureCollection[0] }
        } catch (e) {
          console.log('error parsing geojson: ' + gmlUri + ', ' + txt)
          return undefined
        }
      })

    // @ts-ignore
    return fetchPromise
  } else {
    return Promise.resolve(null)
  }
}

function loadFeaturesFromURI(
  cache: Map<string, Feature<Geometry> | null>,
  uriLoads: UrlLayerPair[],
  targetProjection: olProj.Projection,
  featureLoadedCB: (ft: IdFeaturePair) => void
) {
  // load features from URIs
  const pendingLoads = new Set<string>(uriLoads.map(uri => uri.url))
  // mark all non-existent urls as currently loading (feature = null)
  // so no futher attempts are made to load this multiple times
  uriLoads.forEach(uri => cache.set(uri.url, null))

  function loadUri(uri: string): Promise<any> {
    pendingLoads.delete(uri)
    const featurePromise = loadFeatureFromGeoJsonURI(uri, targetProjection)
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
  for (let i = 0; i < Math.min(PARALLEL_FETCH_COUNT, uriLoads.length); i++) {
    loadUri(uriLoads[i].url)
  }
}

function getOrLoadFeaturesFromWKTOrURL(
  cache: Map<string, Feature<Geometry> | null>,
  gmlUris: UrlLayerPair[],
  targetProjection: olProj.Projection,
  featureLoadedCB: (ft: IdFeaturePair) => void
) {
  // considere only features not already contained in the cache
  const allLoads = gmlUris.filter(uri => !cache.has(uri.url))

  // load Features directly in case WKT is present
  const wktLoads = allLoads.filter(uri => uri.wkt)
  const failedWtkLoads: Set<string> = new Set()
  const wtkResults = wktLoads.map(uri => {
    try {
      const result = loadFeatureFromWTK(uri, targetProjection)
      if (result) {
        cache.set(result.id, result.feature)
      }
      return result
    } catch (e) {
      console.log('invalid wtk encountered for: ' + uri.wkt)
      failedWtkLoads.add(uri.url)
      return undefined
    }
  })
  const succeededWtkResults = wtkResults.filter(
    result => result
  ) as IdFeaturePair[]
  succeededWtkResults.forEach(result => featureLoadedCB(result))

  // load features from WFS if WKT was not present, or loading the WKT failed
  const uriLoads = allLoads.filter(
    uri => !uri.wkt || failedWtkLoads.has(uri.url)
  )
  loadFeaturesFromURI(cache, uriLoads, targetProjection, featureLoadedCB)
}

export { IdFeaturePair, parseGeoJson, getOrLoadFeaturesFromWKTOrURL }
