import { Collection, Feature } from 'ol'
import { FeatureLike } from 'ol/Feature'
import { Geometry } from 'ol/geom'
import VectorLayer from 'ol/layer/Vector'
import RenderFeature from 'ol/render/Feature'
import VectorSource from 'ol/source/Vector'
import Fill from 'ol/style/Fill'
import Stroke from 'ol/style/Stroke'
import Style from 'ol/style/Style'
import { UrlLayerPair, getGmlUrlsFromNodes } from './graph_to_map'
import OLMap from 'ol/Map'
import { GraphModel } from '../models/Graph'
import { getOrLoadFeaturesByURL } from './feature_loading'

type VectorLayerContent = {
  visibleFeatures: Map<string, Feature<Geometry>>
  visibleFeatureCollection: Collection<Feature<Geometry>>
}

function syncVectorLayerContent(
  nodeURLs: UrlLayerPair[],
  featureCache: Map<string, Feature<Geometry> | null>,
  visible: VectorLayerContent
) {
  // add/remove features from vector layer
  const urlsToShow = new Set(nodeURLs.map(nu => nu.url))
  const featuresToRemove = Array.from(visible.visibleFeatures.keys()).filter(
    url => !urlsToShow.has(url)
  )
  if (featuresToRemove.length > 0) {
    visible.visibleFeatureCollection.clear()
    visible.visibleFeatures.clear()
  }
  const featuresToAdd = nodeURLs.filter(
    nu => !visible.visibleFeatures.has(nu.url)
  )
  featuresToAdd.forEach(url => {
    const feature = featureCache.get(url.url)
    if (feature) {
      visible.visibleFeatures.set(url.url, feature)
      visible.visibleFeatureCollection.push(feature)
    }
  })
}

function clearVectorLayerContent(content: VectorLayerContent) {
  content.visibleFeatureCollection.clear()
  content.visibleFeatures.clear()
}

function syncVectorLayer(
  map: OLMap,
  featureCache: Map<string, Feature<Geometry> | null>,
  content: VectorLayerContent,
  forceUpdate: () => void,
  graph?: GraphModel
) {
  // vector nodes handling
  if (graph) {
    const nodeURLs = getGmlUrlsFromNodes(graph)
    getOrLoadFeaturesByURL(
      featureCache,
      nodeURLs.map(nu => nu.url),
      map.getView().getProjection(),
      () => forceUpdate()
    )
    syncVectorLayerContent(nodeURLs, featureCache, content)
  } else {
    clearVectorLayerContent(content)
  }
}

const idStyleMap: Map<string, Style> = new Map()

function styleVectorFeature(feature: FeatureLike) {
  const strId = '' + feature.getId()

  if (strId.indexOf('ProtectedSite') > -1) {
    const preComputedStyle = idStyleMap.get(strId)
    if (preComputedStyle) {
      return preComputedStyle
    } else {
      const rand = Math.random()
      const r = Math.round(rand * 72)
      const g = Math.round(rand * 255)
      const b = Math.round(rand * 135)
      const a = 0.3

      const style = new Style({
        fill: new Fill({
          color: 'rgba(' + r + ',' + g + ',' + b + ', ' + a + ')'
        }),
        stroke: new Stroke({
          color: 'black'
        })
      })
      idStyleMap.set(strId, style)
      return style
    }
  } else {
    const style = new Style({
      fill: new Fill({
        color: 'rgba(0, 0, 255, 0.05)'
      }),
      stroke: new Stroke({
        color: 'white'
      })
    })

    return style
  }
}

function createVectorLayer(featureColl: Collection<Feature<Geometry>>) {
  const vectorLayer = new VectorLayer({
    source: new VectorSource({
      features: featureColl
    }),

    zIndex: 2,
    style: styleVectorFeature
  })

  return vectorLayer
}

export { VectorLayerContent, createVectorLayer, syncVectorLayer }
