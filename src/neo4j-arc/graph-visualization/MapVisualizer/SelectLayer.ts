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
  getOrLoadFeaturesFromWKTOrURL,
  parseGeoJson
} from './feature_loading'
import TileLayer from 'ol/layer/Tile'
import TileWMS from 'ol/source/TileWMS'
import OLMap from 'ol/Map'
import { Graph } from '../GraphVisualizer/Graph/Graph'
import { GraphEventHandlerModel } from '../GraphVisualizer/Graph/GraphEventHandlerModel'
import { selectNodeById } from './map_to_graph'
import { GraphModel } from '../models/Graph'
import { DispatchWithoutAction, MutableRefObject } from 'react'
import { NodeModel } from '../models/Node'
import { VizItem } from '../types'
import { getGmlUrlLayerPairFromNode, UrlLayerPair } from './graph_to_map'
import { Coordinate } from 'ol/coordinate'
import { GML_IDENTIFIER_KEY } from '../config'

type FeatureSelectListener = (node: NodeModel) => void

type SelectLayerContent = {
  selectedFeature: IdFeaturePair | null
  selectedFeatureCollection: Collection<Feature<Geometry>>
}

function closeSelectionPopup(map: OLMap) {
  map.removeOverlay(map.getOverlayById('sel'))
}

function selectSingleNode(
  // map: OLMap,
  // coordinate: Coordinate,
  // clicked : boolean,
  selid: string,
  graph: GraphModel,
  geh: GraphEventHandlerModel,
  featureListener: FeatureSelectListener
) {
  const node = selectNodeById(selid, graph, geh)
  if (node) {
    featureListener(node)
    //forceUpdate()
  }

  // Popup for in-Map click, currnetly unused
  // if(clicked) {
  //   // const content = document.createElement('ol') as HTMLOListElement
  //   // content.style.background = 'rgba(255,255,255,0.75)'
  //   const popup = document.getElementById("popup");

  //   if(popup) {
  //   const ov = new Overlay({
  //     element: popup,
  //     position: coordinate,
  //     id: 'sel',
  //     stopEvent: false
  //   })
  //   map.addOverlay(ov)
  // }
  // }
}

function displaySelectedNodeChooser(
  map: OLMap,
  coordinate: Coordinate,
  nodeIDs: string[],
  forceUpdate: () => void,
  graph: GraphModel,
  geh: GraphEventHandlerModel,
  featureListener: FeatureSelectListener
) {
  if (nodeIDs.length > 1) {
    const content = document.createElement('ol') as HTMLOListElement
    content.style.background = 'rgba(255,255,255,0.75)'

    const liElems: Array<HTMLElement> = []
    for (let i = 0; i < nodeIDs.length; i++) {
      const nodeId = nodeIDs[i]
      const li = document.createElement('li')
      liElems.push(li)
      li.style.cursor = 'pointer'

      li.innerText = nodeId
      content.appendChild(li)
      li.onmouseover = () => {
        selectSingleNode(li.innerText, graph, geh, featureListener)
        liElems.forEach(l => (l.style.fontWeight = ''))
        li.style.fontWeight = 'bold'
      }
      li.onclick = () => {
        closeSelectionPopup(map)
        selectSingleNode(li.innerText, graph, geh, featureListener)
      }
    }

    const ov = new Overlay({
      element: content,
      position: coordinate,
      id: 'sel',
      stopEvent: false
    })
    map.addOverlay(ov)
  } else if (nodeIDs.length == 1) {
    selectSingleNode(nodeIDs[0], graph, geh, featureListener)
  } else {
    //TODO: Clear selection
    forceUpdate()
  }
}

// Handles Click on Map for Map -> Graph interaction.
function handleSelectClick(
  e: MapBrowserEvent<any>,
  featureCache: Map<string, Feature<Geometry> | null>,
  psLayers: TileLayer<TileWMS>[],
  forceUpdate: () => void,
  vectorLayer: VectorLayer<any>,
  graph: GraphModel,
  geh: GraphEventHandlerModel,
  featureListener: FeatureSelectListener
) {
  const viewResolution = e.map.getView().getResolution() ?? 0

  closeSelectionPopup(e.map)

  if (psLayers.length > 0) {
    // TODO: Make capable of handling multiple layers
    const url = psLayers[0]
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
          // Sometimes openlayers seems to create invalid getFeatureInfo-Requests where
          // the requested coordinates are not located in the queried tile.
          // this results in a ServiceException: 113, 259 not in dimensions of image: 256, 256
          // don't crash on those reposes because of invalid JSON, simply ignore them
          try {
            const featureCollection = parseGeoJson(
              txt,
              e.map.getView().getProjection()
            )
            featureCollection.forEach(ft => {
              const url = ft.get(GML_IDENTIFIER_KEY)
              featureCache.set(url, ft)
            })

            const nodeIds = featureCollection.map(ft =>
              ft.get(GML_IDENTIFIER_KEY)
            )
            displaySelectedNodeChooser(
              e.map,
              e.coordinate,
              nodeIds,
              forceUpdate,
              graph,
              geh,
              featureListener
            )
          } catch (e) {}
        })
    }
  } else {
    const allFeatures = e.map.getFeaturesAtPixel(e.pixel, {
      layerFilter: layer => layer === vectorLayer
    })
    const vectorIds = allFeatures
      .map(ft => ft.get(GML_IDENTIFIER_KEY) as string)
      .filter(id => id)
      .sort()

    displaySelectedNodeChooser(
      e.map,
      e.coordinate,
      vectorIds,
      forceUpdate,
      graph,
      geh,
      featureListener
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
    const gmlUri = getGmlUrlLayerPairFromNode(selectedItem.item as NodeModel)
    if (gmlUri.url) {
      // const uri : UrlLayerPair = {layers : [], url : gmlUri, wkt : undefined };

      // if (gmlUri)
      //   {
      getOrLoadFeaturesFromWKTOrURL(
        featureCache,
        [gmlUri],
        map.getView().getProjection(),
        () => forceUpdate()
      )
      syncSelectLayerContent(gmlUri.url, featureCache, selection)
      // }
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
  syncSelectLayer,
  closeSelectionPopup,
  FeatureSelectListener
}
