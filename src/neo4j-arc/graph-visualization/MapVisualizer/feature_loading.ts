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

type IdFeaturePair = { id: string; feature: Feature<Geometry> } | null

function parseGeoJson(txt: string, targetProjection: olProj.Projection) {
  return new GeoJSON().readFeatures(txt, {
    dataProjection: 'EPSG:3035',
    featureProjection: targetProjection
  })
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
        const featureCollection = parseGeoJson(txt, targetProjection)
        return { id: gmlUri, feature: featureCollection[0] }
      })

    // @ts-ignore
    return fetchPromise
  } else {
    return Promise.resolve(null)
  }
}

function getOrLoadFeaturesByURL(
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

export { IdFeaturePair, parseGeoJson, loadFeature, getOrLoadFeaturesByURL }
