import { Collection, Feature, MapBrowserEvent, Overlay } from 'ol'
import { FeatureLike } from 'ol/Feature'
import { Geometry } from 'ol/geom'
import VectorLayer from 'ol/layer/Vector'
import RenderFeature from 'ol/render/Feature'
import VectorSource from 'ol/source/Vector'
import Fill from 'ol/style/Fill'
import Stroke from 'ol/style/Stroke'
import Style from 'ol/style/Style'
import {
  IdFeaturePair,
  getOrLoadFeaturesByURL,
  parseGeoJson
} from './feature_loading'
import TileLayer from 'ol/layer/Tile'
import TileWMS from 'ol/source/TileWMS'
import OLMap from 'ol/Map'
import { Graph } from '../GraphVisualizer/Graph/Graph'
import { GraphEventHandlerModel } from '../GraphVisualizer/Graph/GraphEventHandlerModel'
import { selectNodeById } from './map_to_graph'
import { GraphModel } from '../models/Graph'
import { DispatchWithoutAction } from 'react'
import { NodeModel } from '../models/Node'
import { VizItem } from '../types'
import { getGmlUrlFromNode } from './graph_to_map'
import { Coordinate } from 'ol/coordinate'

type SelectLayerContent = {
  selectedFeature: IdFeaturePair | null
  selectedFeatureCollection: Collection<Feature<Geometry>>
}

function closeSelectionPopup(map: OLMap) {
  map.removeOverlay(map.getOverlayById('sel'))
}

function selectSingleNode(
  selid: string,
  forceUpdate: () => void,
  graph: GraphModel,
  geh: GraphEventHandlerModel
) {
  if (selectNodeById(selid, graph, geh)) {
    forceUpdate()
  }
}

function displaySelectedNodeChooser(
  map: OLMap,
  coordinate: Coordinate,
  nodeIDs: string[],
  forceUpdate: () => void,
  graph: GraphModel,
  geh: GraphEventHandlerModel
) {
  if (nodeIDs.length > 1) {
    const content = document.createElement('ol') as HTMLOListElement
    content.style.background = 'rgba(255,255,255,0.75)'
    for (let i = 0; i < nodeIDs.length; i++) {
      const li = document.createElement('li')
      li.style.cursor = 'pointer'
      li.innerText = nodeIDs[i]
      content.appendChild(li)
      li.onmouseover = () =>
        selectSingleNode(li.innerText, forceUpdate, graph, geh)
      li.onclick = () => closeSelectionPopup(map)
    }

    const ov = new Overlay({
      element: content,
      position: coordinate,
      id: 'sel',
      stopEvent: false
    })
    map.addOverlay(ov)
  } else if (nodeIDs.length == 1) {
    selectSingleNode(nodeIDs[0], forceUpdate, graph, geh)
  } else {
    //TODO: Clear selection
    forceUpdate()
  }
}

function handleSelectClick(
  e: MapBrowserEvent<any>,
  featureCache: Map<string, Feature<Geometry> | null>,
  psLayer: TileLayer<TileWMS> | null,
  forceUpdate: () => void,
  vectorLayer: VectorLayer<any>,
  graph: GraphModel,
  geh: GraphEventHandlerModel
) {
  const viewResolution = e.map.getView().getResolution() ?? 0

  closeSelectionPopup(e.map)

  if (psLayer) {
    const url = psLayer
      .getSource()
      ?.getFeatureInfoUrl(
        e.coordinate,
        viewResolution,
        e.map.getView().getProjection(),
        {
          INFO_FORMAT: 'application/json',
          FEATURE_COUNT: 10
        }
      )
    if (url) {
      fetch(url)
        .then(response => response.text())
        .then(txt => {
          const featureCollection = parseGeoJson(
            txt,
            e.map.getView().getProjection()
          )
          featureCollection.forEach(ft => {
            const url = ft.get('gml:identiifer')
            featureCache.set(url, ft)
          })

          const nodeIds = featureCollection.map(ft => ft.get('gml:id'))
          displaySelectedNodeChooser(
            e.map,
            e.coordinate,
            nodeIds,
            forceUpdate,
            graph,
            geh
          )
        })
    }
  } else {
    const allFeatures = e.map.getFeaturesAtPixel(e.pixel, {
      layerFilter: layer => layer === vectorLayer
    })
    const vectorIds = allFeatures
      .map(node => node.getId())
      .filter(id => typeof id === 'string')
      .map(id => id as string)
      .filter(id => id.indexOf('ProtectedSite') > -1)
    displaySelectedNodeChooser(
      e.map,
      e.coordinate,
      vectorIds,
      forceUpdate,
      graph,
      geh
    )
  }
}

function syncSelectLayerContent(
  gmlUri: string,
  featureCache: Map<string, Feature<Geometry> | null>,
  sel: SelectLayerContent
) {
  if (sel.selectedFeature == null || sel.selectedFeature.id != gmlUri) {
    sel.selectedFeatureCollection.clear()

    const feature = featureCache.get(gmlUri)
    if (feature) {
      sel.selectedFeatureCollection.push(feature)
      sel.selectedFeature = { id: gmlUri, feature: feature }
    } else {
      sel.selectedFeature = null
    }
  }
}

function clearSelectLayerContent(selected: SelectLayerContent) {
  selected.selectedFeature = null
  selected.selectedFeatureCollection.clear()
}

function syncSelectLayer(
  map: OLMap,
  featureCache: Map<string, Feature<Geometry> | null>,
  selection: SelectLayerContent,
  forceUpdate: () => void,
  selectedItem?: VizItem
) {
  if (map && selectedItem && selectedItem.type === 'node') {
    const gmlUri = getGmlUrlFromNode(selectedItem.item as NodeModel)
    if (gmlUri) {
      getOrLoadFeaturesByURL(
        featureCache,
        [gmlUri],
        map.getView().getProjection(),
        () => forceUpdate()
      )
      syncSelectLayerContent(gmlUri, featureCache, selection)
    }
  } else {
    clearSelectLayerContent(selection)
  }
}

function createSelectLayer(selectedColl: Collection<Feature<Geometry>>) {
  return new VectorLayer({
    source: new VectorSource({
      features: selectedColl
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
}

export {
  SelectLayerContent,
  createSelectLayer,
  handleSelectClick,
  syncSelectLayer
}
