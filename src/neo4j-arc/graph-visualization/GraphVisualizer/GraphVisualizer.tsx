/*
 * Copyright (c) "Neo4j"
 * Neo4j Sweden AB [http://neo4j.com]
 *
 * This file is part of Neo4j.
 *
 * Neo4j is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
import deepmerge from 'deepmerge'
import { debounce } from 'lodash-es'
import React, {
  Component,
  ReactNode,
  useState,
  FC,
  useMemo,
  useEffect,
  useRef
} from 'react'

import { Graph } from './Graph/Graph'
import { NodeInspectorPanel, defaultPanelWidth } from './NodeInspectorPanel'
import { StyledFullSizeContainer, panelMinWidth } from './styled'
import {
  BasicNode,
  BasicNodesAndRels,
  BasicRelationship,
  deepEquals
} from 'neo4j-arc/common'
import { DetailsPaneProps } from './DefaultPanelContent/DefaultDetailsPane'
import { OverviewPaneProps } from './DefaultPanelContent/DefaultOverviewPane'
import { GraphStyleModel } from '../models/GraphStyle'
import { GetNodeNeighboursFn, VizItem } from '../types'
import {
  GraphStats,
  GraphStatsRelationshipTypes,
  mapNodes,
  mapRelationships
} from '../utils/mapper'
import { GraphModel } from '../models/Graph'
import {
  GraphEventHandlerModel,
  GraphInteractionCallBack
} from './Graph/GraphEventHandlerModel'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  GeoJSON,
  useMap,
  useMapEvent,
  useMapEvents,
  LayerGroup,
  LayerGroupProps,
  WMSTileLayer
} from 'react-leaflet'
import { GeoJsonObject, FeatureCollection } from 'geojson'

import { WFS, GML } from 'ol/format'
import GML32 from 'ol/format/GML32'
import * as olProj from 'ol/proj'
import { GeoJSON as OLGeoJson } from 'ol/format'
import { LineString, Point } from 'ol/geom'

import { register } from 'ol/proj/proj4'
import * as proj4x from 'proj4'
import VectorLayer from 'ol/layer/Vector'
import { Feature } from 'ol'
import { SyncPanel } from './SyncPanel'
const proj4 = (proj4x as any).default

/**
 * @description Create input GeoJSON bounding box.
 * @param {GeoJSON} geojson Input GeoJSON.
 * @return {Array} GeoJSON bounding box.
 */
function computeBoundingBox(geojson: any): any {
  const bbox = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY
  ]

  // Update bbox with each coordinate
  let dimensions = 2
  for (const coordinate of coordEach(geojson)) {
    dimensions = Math.max(dimensions, coordinate.length)
    for (let i = 0; i < coordinate.length; ++i) {
      const j = 3 + i
      bbox[i] = Math.min(bbox[i], coordinate[i])
      bbox[j] = Math.max(bbox[j], coordinate[i])
    }
  }

  // Remove 3rd dimension if not present in data.
  if (dimensions !== 3) {
    return [bbox[0], bbox[1], bbox[3], bbox[4]]
  }
  return bbox
}

/**
 * @description Generator that yields each GeoJSON coordinate.
 * @param {GeoJSON} geojson Input GeoJSON.
 * @yields [Array] GeoJSON 2D or 3D coordinate.
 */
function* coordEach(geojson: any): any {
  switch (geojson.type) {
    case 'Point':
      yield geojson.coordinates
      break
    case 'LineString':
    case 'MultiPoint':
      yield* geojson.coordinates
      break
    case 'Polygon':
    case 'MultiLineString':
      for (const part of geojson.coordinates) {
        yield* part
      }
      break
    case 'MultiPolygon':
      for (const polygon of geojson.coordinates) {
        for (const ring of polygon) {
          yield* ring
        }
      }
      break
    case 'GeometryCollection':
      for (const geometry of geojson.geometries) {
        yield* coordEach(geometry)
      }
      break
    case 'FeatureCollection':
      for (const feature of geojson.features) {
        yield* coordEach(feature)
      }
      break
    default:
      yield* coordEach(geojson.geometry)
  }
}

const DEFAULT_MAX_NEIGHBOURS = 100

type MapParentProps = {
  zoomLevel: number
  //mapNodes: BasicNode[]
  nodeURLs: string[]
  graph?: GraphModel
  geh?: GraphEventHandlerModel
  updateMapNodes(zoom: number, zoomDetailLevel: number, bounds: any): void
  position: [number, number]
}

type MapParentState = {
  geodata: GeoJsonObject
  geoselection: GeoJsonObject
  zoomLevel: number
}

type ZoomChangeProps = {
  onZoomChange: Function
}

function ZoomHandler(props: ZoomChangeProps) {
  const [zoomLevel, setZoomLevel] = useState(8)

  const mapEvents = useMapEvents({
    zoomend: () => {
      setZoomLevel(mapEvents.getZoom())
      props.onZoomChange(mapEvents.getZoom())
    }
  })

  return null
}

type BoundingBoxChangeProps = {
  //updateQuery?: (query: string) => Promise<BasicNodesAndRels>
  //graph?: GraphModel
  //updateNodes : (graph : BasicNodesAndRels) => any
  //zoomLevel : number
  //detailZoomStart : number,
  //zoomState : { zoomLevel: number, setZoomLevel : React.Dispatch<React.SetStateAction<number>>}
  onBoundsChanged: (bounds: any) => void
  onZoomChange: (zoom: number) => void
}

// Todo: move sync function out, so it can be also called by button click
function BoundingBoxHandler(props: BoundingBoxChangeProps) {
  const mapEvents = useMapEvents({
    zoomend: (e: any) => {
      console.log(e)
      //props.zoomState.setZoomLevel(mapEvents.getZoom())
      props.onZoomChange(mapEvents.getZoom())
    },
    moveend: () => {
      props.onBoundsChanged(mapEvents.getBounds())
    }
  })

  return null
}

async function fetchFeaturesFromGmlURL(
  gmlURL: string
): Promise<{ geodata: FeatureCollection; url: string }> {
  const parser = new WFS({
    featureNS: 'http://mapserver.gis.umn.edu/mapserver',
    version: '2.0.0'
  })

  return fetch(gmlURL)
    .then(response => response.text())
    .then(data => {
      data = data.replace('.swwat.', '.swaat.')
      const wfsFeatures = parser.readFeatures(data)
      const gmlString = new GML32({
        srsName: 'urn:ogc:def:crs:EPSG::4326',
        featureNS: 'swaat'
      }).writeFeatures(wfsFeatures)

      const gjs1 = JSON.parse(
        new OLGeoJson().writeFeatures(wfsFeatures, {
          featureProjection: 'EPSG:4326',
          dataProjection: 'EPSG:4326'
        })
      )

      try {
        const bBox = computeBoundingBox(gjs1)
        //.replace("swwat", "swaat")
        console.log(
          'MATCH(n {`gml:id` : "' +
            gjs1.features[0].id +
            '"}) SET n += { x1: ' +
            bBox[0] +
            ', x2: ' +
            bBox[3] +
            ',y1: ' +
            bBox[1] +
            ', y2: ' +
            bBox[4] +
            ' }'
        )
      } catch (e) {}

      const gjs = JSON.parse(
        new OLGeoJson().writeFeatures(wfsFeatures, {
          featureProjection: 'EPSG:31287',
          dataProjection: 'EPSG:4326'
        })
      ) as FeatureCollection

      return { geodata: gjs, url: gmlURL }
    })
}

function ViewComp(props: { center: number[] }) {
  const map = useMap()

  useEffect(() => {
    if (
      Math.round(map.getCenter().lat * 100) / 100 !==
      Math.round(props.center[0] * 100) / 100
    ) {
      //console.log(JSON.stringify({lat: props.center[0], lng: props.center[1]})+"; " + JSON.stringify(map.getCenter()))
      //map.setView({lat: props.center[0], lng: props.center[1]});
    }
  }, [props.center, map])

  return null
}

function MapParent(props: MapParentProps) {
  // run only once, because no dependencies
  useEffect(() => {
    proj4.defs(
      'EPSG:31287',
      '+proj=lcc +axis=neu +lat_0=47.5 +lon_0=13.3333333333333 +lat_1=49 +lat_2=46 +x_0=400000 +y_0=400000 +ellps=bessel +towgs84=577.326,90.129,463.919,5.137,1.474,5.297,2.42319999999019 +units=m +no_defs +type=crs'
    )
    register(proj4)
  }, [])

  const [selectedItem, setSelectedItem] = useState(props.geh?.selectedItem)
  if (selectedItem !== props.geh?.selectedItem) {
    setSelectedItem(props.geh?.selectedItem)
  }

  // Handle click on Layer
  const onEachFeature = (feature: any, layer: any) => {
    layer.on('click', () => {
      //typo in gmlid
      const gmlId = feature.id //.replace('swwat', 'swaat');

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

  const [zoomLevel, setZoomLevel] = useState(8)
  const [bounds, setBounds] = useState<any>()
  const [_geodata, setGeoData] = useState<FeatureCollection>({
    type: 'FeatureCollection',
    features: []
  })
  const [shownURLs, setShownURLs] = useState(new Set<string>())
  const [fetchCounter, setFetchCounter] = useState(0)
  const processedURLs = useRef(new Map<string, Feature | null>())

  //Filter selected objects based on their ID - depending on the currently selected item
  const selectedGeoData = {
    type: 'FeatureCollection',
    features: []
  } as FeatureCollection
  if (selectedItem) {
    const selId = selectedItem.propertyList.find(p => p.key === 'gml:id')?.value
    //TODO swaat, swwat ("" + f.id).replace('swwat', 'swaat')
    selectedGeoData.features = _geodata.features.filter(f => f.id === selId)
  }

  const updateMapData = (nodesURLs: string[]) => {
    const gmlURLs = nodesURLs

    // fetch only urls which have not been fetched before
    let unfetchedURLs = gmlURLs.filter(url => !processedURLs.current.has(url))
    if (unfetchedURLs.length > 0) {
      unfetchedURLs = [...new Set(unfetchedURLs)]
      unfetchedURLs.forEach(url => processedURLs.current.set(url, null))
      //processedURLs.current = processedURLs.current;
      //is this needed at all?
      //setProcessedURLs(processedURLs.current);

      const pendingFetches = unfetchedURLs.map(gmlURL => {
        console.log('start fetching of: ' + gmlURL)
        return fetchFeaturesFromGmlURL(gmlURL).catch(e =>
          console.log('Error fetching url: ' + gmlURL + ' ' + e)
        )
      })

      Promise.all(pendingFetches).then(f => {
        try {
          const fNotVoid = f as { geodata: FeatureCollection; url: string }[]
          fNotVoid.forEach(res => {
            // @ts-ignore
            processedURLs.current.set(res.url, res.geodata.features[0])
          })

          setFetchCounter(fetchCounter + 1)

          //to: re-creation not required
          /*   const loadedFeatureCollections = f.map(res => fNotVoid.geodata) as FeatureCollection[]
          const loadedURLs = f.map(res => fNotVoid.url);
          const featureCollection: FeatureCollection = {
            type: 'FeatureCollection',
            features: []
          }
          featureCollection.features = _geodata.features.concat(loadedFeatureCollections.map(col => col.features[0])) //TODO
          loadedFeatureCollections.forEach(lfc =>
            featureCollection.features.push(lfc.features[0])
          )
          */
        } catch (e) {
          console.log(e)
        }
      })
    }
  }

  function assembleFeatureCollection(): {
    collection: FeatureCollection
    shownURLs: Set<string>
  } {
    const featureCollection: FeatureCollection = {
      type: 'FeatureCollection',
      features: []
    }

    const urls = new Set<string>()
    props.nodeURLs.forEach(url => {
      const feature = processedURLs.current.get(url)
      if (feature && feature != null) {
        // @ts-ignore
        featureCollection.features.push(feature)
        urls.add(url)
      }
    })

    return { collection: featureCollection, shownURLs: urls }
  }

  const dataToShow = assembleFeatureCollection()
  const newURLs = JSON.stringify(Array.from(dataToShow.shownURLs))
  const oldURLs = JSON.stringify(Array.from(shownURLs))
  if (newURLs !== oldURLs) {
    setShownURLs(dataToShow.shownURLs)
    setGeoData(dataToShow.collection)
  }

  const detailZoomLevel = 11

  let layer
  if (zoomLevel >= detailZoomLevel) {
    layer = (
      <GeoJSON
        key={Math.random()}
        data={_geodata}
        // @ts-expect-error
        onEachFeature={onEachFeature}
        pathOptions={{ color: 'blue', weight: 1 }}
      />
    )
  } else {
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

  console.log(JSON.stringify(props.position))

  useEffect(() => {
    if (zoomLevel < detailZoomLevel) {
      return
    }

    updateMapData(props.nodeURLs)
  })

  const onMapZoomChange = (zoom: number) => {
    setZoomLevel(zoom)
    props.updateMapNodes(zoomLevel, detailZoomLevel, bounds)
  }

  const onMapBoundsChange = (bounds: any) => {
    setBounds(bounds)
    props.updateMapNodes(zoomLevel, detailZoomLevel, bounds)
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      {/*zoomLevel*/}
      {zoomLevel}
      <MapContainer
        style={{ width: '100%', height: '100%', zIndex: 1 }}
        center={props.position}
        zoom={zoomLevel}
        scrollWheelZoom={true}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <GeoJSON
          key={Math.random()}
          data={selectedGeoData}
          // @ts-expect-error
          onEachFeature={onEachFeature}
          pathOptions={{ color: 'red', weight: 5 }}
        />
        {layer}
        {/*<ZoomHandler onZoomChange={setZoomLevel} /> */}
        <BoundingBoxHandler
          onZoomChange={onMapZoomChange}
          onBoundsChanged={onMapBoundsChange}
        />
        {/*<ViewComp center={props.position} />*/}
      </MapContainer>
    </div>
  )
}

type GraphVisualizerDefaultProps = {
  maxNeighbours: number
  updateStyle: (style: any) => void
  isFullscreen: boolean
  assignVisElement: (svgElement: any, graphElement: any) => void
  getAutoCompleteCallback: (
    callback: (rels: BasicRelationship[], initialRun: boolean) => void
  ) => void
  setGraph: (graph: GraphModel) => void
  hasTruncatedFields: boolean
  nodePropertiesExpandedByDefault: boolean
  setNodePropertiesExpandedByDefault: (expandedByDefault: boolean) => void
  wheelZoomInfoMessageEnabled?: boolean
  initialZoomToFit?: boolean
  disableWheelZoomInfoMessage: () => void
  useGeneratedDefaultColors: boolean
}
type GraphVisualizerProps = GraphVisualizerDefaultProps & {
  relationships: BasicRelationship[]
  nodes: BasicNode[]
  maxNeighbours?: number
  graphStyleData?: any
  getNeighbours?: (
    id: string,
    currentNeighbourIds: string[] | undefined
  ) => Promise<BasicNodesAndRels & { allNeighboursCount: number }>
  updateQuery?: (query: string) => Promise<BasicNodesAndRels>
  updateStyle?: (style: any) => void
  isFullscreen?: boolean
  assignVisElement?: (svgElement: any, graphElement: any) => void
  getAutoCompleteCallback?: (
    callback: (rels: BasicRelationship[], initialRun: boolean) => void
  ) => void
  setGraph?: (graph: GraphModel) => void
  hasTruncatedFields?: boolean
  nodeLimitHit?: boolean
  nodePropertiesExpandedByDefault?: boolean
  setNodePropertiesExpandedByDefault?: (expandedByDefault: boolean) => void
  wheelZoomRequiresModKey?: boolean
  wheelZoomInfoMessageEnabled?: boolean
  disableWheelZoomInfoMessage?: () => void
  DetailsPaneOverride?: React.FC<DetailsPaneProps>
  OverviewPaneOverride?: React.FC<OverviewPaneProps>
  onGraphInteraction?: GraphInteractionCallBack
  useGeneratedDefaultColors?: boolean
  autocompleteRelationships: boolean
}

type GraphVisualizerState = {
  graphStyle: GraphStyleModel
  hoveredItem: VizItem
  nodes: BasicNode[]
  nodeURLs: string[]
  relationships: BasicRelationship[]
  mapGraph?: BasicNodesAndRels
  selectedItem: VizItem
  stats: GraphStats
  styleVersion: number
  freezeLegend: boolean
  width: number
  nodePropertiesExpanded: boolean
  mapPosition: number[]
  syncWithMap: boolean
  syncWithGraph: boolean
  bounds: any
  zoom: number
}

export class GraphVisualizer extends Component<
  GraphVisualizerProps,
  GraphVisualizerState
> {
  defaultStyle: any

  static defaultProps: GraphVisualizerDefaultProps = {
    maxNeighbours: DEFAULT_MAX_NEIGHBOURS,
    updateStyle: () => undefined,
    isFullscreen: false,
    assignVisElement: () => undefined,
    getAutoCompleteCallback: () => undefined,
    setGraph: () => undefined,
    hasTruncatedFields: false,
    nodePropertiesExpandedByDefault: true,
    setNodePropertiesExpandedByDefault: () => undefined,
    wheelZoomInfoMessageEnabled: false,
    disableWheelZoomInfoMessage: () => undefined,
    useGeneratedDefaultColors: true
  }

  constructor(props: GraphVisualizerProps) {
    super(props)
    const graphStyle = new GraphStyleModel(this.props.useGeneratedDefaultColors)
    this.defaultStyle = graphStyle.toSheet()
    const {
      nodeLimitHit,
      nodes,
      relationships,
      nodePropertiesExpandedByDefault
    } = this.props

    const selectedItem: VizItem = nodeLimitHit
      ? {
          type: 'status-item',
          item: `Not all return nodes are being displayed due to Initial Node Display setting. Only first ${this.props.nodes.length} nodes are displayed.`
        }
      : {
          type: 'canvas',
          item: {
            nodeCount: nodes.length,
            relationshipCount: relationships.length
          }
        }

    if (this.props.graphStyleData) {
      const rebasedStyle = deepmerge(
        this.defaultStyle,
        this.props.graphStyleData
      )
      graphStyle.loadRules(rebasedStyle)
    }
    this.state = {
      stats: {
        labels: {},
        relTypes: {}
      },
      graphStyle,
      styleVersion: 0,
      nodes,
      relationships,
      selectedItem,
      hoveredItem: selectedItem,
      freezeLegend: false,
      width: defaultPanelWidth(),
      nodePropertiesExpanded: nodePropertiesExpandedByDefault,
      mapPosition: [47.35, 13.63],
      syncWithMap: true,
      syncWithGraph: false,
      bounds: null,
      zoom: 8,
      nodeURLs: []
    }
  }

  getNodeNeighbours: GetNodeNeighboursFn = (
    node,
    currentNeighbourIds,
    callback
  ) => {
    if (currentNeighbourIds.length > this.props.maxNeighbours) {
      callback({ nodes: [], relationships: [] })
    }
    if (this.props.getNeighbours) {
      this.props.getNeighbours(node.id, currentNeighbourIds).then(
        ({ nodes, relationships, allNeighboursCount }) => {
          if (allNeighboursCount > this.props.maxNeighbours) {
            this.setState({
              selectedItem: {
                type: 'status-item',
                item: `Rendering was limited to ${this.props.maxNeighbours} of the node's total ${allNeighboursCount} neighbours due to browser config maxNeighbours.`
              }
            })
          }
          callback({ nodes, relationships })
        },
        () => {
          callback({ nodes: [], relationships: [] })
        }
      )
    }
  }

  onItemMouseOver(item: VizItem): void {
    this.setHoveredItem(item)
  }

  mounted = true
  setHoveredItem = debounce((hoveredItem: VizItem) => {
    if (this.mounted) {
      this.setState({ hoveredItem })
    }
  }, 200)

  onItemSelect(selectedItem: VizItem): void {
    this.setState({ selectedItem })

    // eventuell in main - re-render will happen anyway
    if (this.state.selectedItem.type === 'node') {
      const x1 = parseFloat(
        this.state.selectedItem.item.propertyList.find(p => p.key == 'x1')
          ?.value || '0'
      )
      const y1 = parseFloat(
        this.state.selectedItem.item.propertyList.find(p => p.key == 'y1')
          ?.value || '0'
      )
      const x2 = parseFloat(
        this.state.selectedItem.item.propertyList.find(p => p.key == 'x2')
          ?.value || '0'
      )
      const y2 = parseFloat(
        this.state.selectedItem.item.propertyList.find(p => p.key == 'y2')
          ?.value || '0'
      )

      if (x1 > 0) {
        const top = olProj.toLonLat([x1, y1], 'EPSG:31287')
        //const bottom = olProj.toLonLat([x2, y2], 'EPSG:4326');
        console.log(JSON.stringify(top))
        this.setState({ mapPosition: [top[1], top[0]] })
      }
    }

    //console.log(JSON.stringify(proj4))

    /*   const parser = new WFS({
      featureNS: 'http://mapserver.gis.umn.edu/mapserver',
      version: '2.0.0'
    });
  
      let layerData = undefined;
      if(this.state.selectedItem !== undefined) {
        if(this.state.selectedItem.type === 'node') {
          const gmlURL = this.state.selectedItem.item.propertyList.find(p => p.key == 'gml:identifier')?.value || undefined;
          if(gmlURL !== undefined) {
              this.fetchFeaturesFromGmlURL(gmlURL).then(feature => this.setState({geoselection : feature}))
            }
          }
  
      layerData = undefined;
      }
      */
  }

  onGraphModelChange(stats: GraphStats): void {
    this.setState({ stats })
    if (this.props.updateStyle) {
      this.props.updateStyle(this.state.graphStyle.toSheet())
    }
  }

  componentDidUpdate(prevProps: GraphVisualizerProps): void {
    if (!deepEquals(prevProps.graphStyleData, this.props.graphStyleData)) {
      if (this.props.graphStyleData) {
        const rebasedStyle = deepmerge(
          this.defaultStyle,
          this.props.graphStyleData
        )
        this.state.graphStyle.loadRules(rebasedStyle)
        this.setState({
          graphStyle: this.state.graphStyle,
          styleVersion: this.state.styleVersion + 1
        })
      } else {
        this.state.graphStyle.resetToDefault()
        this.setState(
          { graphStyle: this.state.graphStyle, freezeLegend: true },
          () => {
            this.setState({ freezeLegend: false })
            this.props.updateStyle(this.state.graphStyle.toSheet())
          }
        )
      }
    }
  }

  geh?: GraphEventHandlerModel
  g?: GraphModel
  setGraph(g: GraphModel) {
    this.props.setGraph(g)
    this.g = g
  }

  syncGraphWithMapNodes(n: BasicNodesAndRels) {
    const newNodeIDs = new Set(n.nodes.map(n => n.id))
    const existingNodeIDS = new Set(this.g?.nodes().map(n => n.id))

    //const nodesToBeRemoved = this.g?.nodes().filter(n => !newNodeIDs.has(n.id));
    //const nodesBeforeRemoval = this.g?.nodes().length;

    //while(nodesToBeRemoved.)
    {
      //remove all current nodes not contained in the new node-list
      this.g
        ?.nodes()
        .filter(n => !newNodeIDs.has(n.id))
        .forEach(n => {
          this.g?.removeConnectedRelationships(n)
          this.g?.removeNode(n)
        })
    }
    console.log('nodes survived: ' + this.g?.nodes().length)

    const createNodes = n.nodes.filter(n => !existingNodeIDS.has(n.id))

    const nodeModel = mapNodes(createNodes)
    this.g?.addNodes(nodeModel)

    if (this.g) {
      //TODO: Filter relationships
      const relModel = mapRelationships(n.relationships, this.g)
      this.g?.addRelationships(relModel)
    }

    this.geh?.visualization.update({
      updateNodes: true,
      updateRelationships: true,
      restartSimulation: true
    })
    this.geh?.graphModelChanged()
  }

  convertBasicNodesToURL(nodes: BasicNode[]) {
    return Array.from(
      new Set(
        nodes
          .filter(node => 'gml:identifier' in node.properties)
          .map(node => node.properties['gml:identifier'])
      )
    )
  }

  updateMapNodes = (zoom: number, zoomDetailLevel: number, bounds: any) => {
    if (!this.state.syncWithMap) {
      return
    }

    // wenn grob, keine Daten laden (nur für getFeatureInfo)
    if (zoom < zoomDetailLevel) {
      this.syncGraphWithMapNodes({ nodes: [], relationships: [] })
      return
    }

    // je nach zoomstufe
    //console.log("moved: " + JSON.stringify())

    const southWestTrx = olProj.fromLonLat(
      [bounds._southWest.lng, bounds._southWest.lat],
      'EPSG:31287'
    )
    const northEastTrx = olProj.fromLonLat(
      [bounds._northEast.lng, bounds._northEast.lat],
      'EPSG:31287'
    )

    //console.log(JSON.stringify(northWest) + " - " + JSON.stringify(southEast));
    //+ " AND n.y1 <= " + northEastTrx[1]
    //+" AND n.x2 <= " + southWestTrx[0]  +
    const query =
      'MATCH(n) WHERE n.x1 <= ' +
      northEastTrx[0] +
      ' AND n.x2 >= ' +
      southWestTrx[0] +
      ' AND n.y1 <= ' +
      northEastTrx[1] +
      ' AND n.y2 >= ' +
      southWestTrx[1] +
      ' MATCH path = (n)--() return path;'

    console.log(query)
    this.props.updateQuery?.(query).then(resultGraph => {
      this.setState({
        nodes: resultGraph.nodes,
        mapGraph: resultGraph,
        nodeURLs: this.convertBasicNodesToURL(resultGraph.nodes)
      })

      console.log('number of nodes returned: ' + resultGraph.nodes.length)
      if (this.state.syncWithMap) {
        this.syncGraphWithMapNodes(resultGraph)
      }
    })
  }

  setGraphEventHandlerModel(handler: GraphEventHandlerModel) {
    this.geh = handler
  }

  syncOptionsChanged = (
    syncWithMapBound: boolean,
    syncWithGraph: boolean
  ): void => {
    if (syncWithMapBound && this.state.mapGraph) {
      //restore graph based on what was fetched for map before
      this.syncGraphWithMapNodes(this.state.mapGraph)
    }

    if (syncWithGraph) {
      this.syncMapWithGraph()
    }

    this.setState(prev => ({
      ...prev,
      syncWithMap: syncWithMapBound,
      syncWithGraph: syncWithGraph
    }))
  }

  syncMapWithGraph = () => {
    if (this.g) {
      console.log('nodes there: ' + this.g?.nodes().length)

      const urlList = this.g
        ?.nodes()
        .map(n => n.propertyMap['gml:identifier'])
        .filter(url => url)
      if (JSON.stringify(urlList) !== JSON.stringify(this.state.nodeURLs)) {
        this.setState({ nodeURLs: urlList })
      }
      /*
 id: string
  labels: string[]
  properties: Record<string, string>
  propertyTypes: Record<string, string>
*/

      /*
  id: string
  labels: string[]
  propertyList: VizItemProperty[]
  propertyMap: NodeProperties
  isNode = true
  isRelationship = false
  */
    }
  }

  render(): JSX.Element {
    // This is a workaround to make the style reset to the same colors as when starting the browser with an empty style
    // If the legend component has the style it will ask the neoGraphStyle object for styling before the graph component,
    // and also doing this in a different order from the graph. This leads to different default colors being assigned to different labels.
    const graphStyle = this.state.freezeLegend
      ? new GraphStyleModel(this.props.useGeneratedDefaultColors)
      : this.state.graphStyle

    if (this.state.syncWithGraph) {
      this.syncMapWithGraph()
    }

    const nodeURLs = this.convertBasicNodesToURL(this.state.nodes)

    return (
      <StyledFullSizeContainer id="svg-vis">
        <div style={{ position: 'absolute', top: '30px', zIndex: 1000 }}>
          <SyncPanel
            syncWithMapBounds={this.state.syncWithMap}
            syncWithGraph={this.state.syncWithGraph}
            syncOptionsChanged={this.syncOptionsChanged}
          />
        </div>

        <Graph
          isFullscreen={this.props.isFullscreen}
          relationships={this.state.relationships}
          nodes={this.state.nodes}
          getNodeNeighbours={this.getNodeNeighbours.bind(this)}
          onItemMouseOver={this.onItemMouseOver.bind(this)}
          onItemSelect={this.onItemSelect.bind(this)}
          graphStyle={graphStyle}
          styleVersion={this.state.styleVersion} // cheap way for child to check style updates
          onGraphModelChange={this.onGraphModelChange.bind(this)}
          assignVisElement={this.props.assignVisElement}
          getAutoCompleteCallback={this.props.getAutoCompleteCallback}
          autocompleteRelationships={this.props.autocompleteRelationships}
          setGraph={this.setGraph.bind(this)}
          setGraphEventHandler={this.setGraphEventHandlerModel.bind(this)}
          offset={
            (this.state.nodePropertiesExpanded ? this.state.width + 8 : 0) + 8
          }
          wheelZoomRequiresModKey={this.props.wheelZoomRequiresModKey}
          wheelZoomInfoMessageEnabled={this.props.wheelZoomInfoMessageEnabled}
          disableWheelZoomInfoMessage={this.props.disableWheelZoomInfoMessage}
          initialZoomToFit={this.props.initialZoomToFit}
          onGraphInteraction={this.props.onGraphInteraction}
        />

        <MapParent
          position={[this.state.mapPosition[0], this.state.mapPosition[1]]}
          zoomLevel={8}
          graph={this.g}
          geh={this.geh}
          nodeURLs={this.state.nodeURLs}
          updateMapNodes={this.updateMapNodes}
        />

        <NodeInspectorPanel
          graphStyle={graphStyle}
          hasTruncatedFields={this.props.hasTruncatedFields}
          hoveredItem={this.state.hoveredItem}
          selectedItem={this.state.selectedItem}
          stats={this.state.stats}
          width={this.state.width}
          setWidth={(width: number) =>
            this.setState({ width: Math.max(panelMinWidth, width) })
          }
          expanded={this.state.nodePropertiesExpanded}
          toggleExpanded={() => {
            const { nodePropertiesExpanded } = this.state
            this.props.setNodePropertiesExpandedByDefault(
              !nodePropertiesExpanded
            )
            this.setState({ nodePropertiesExpanded: !nodePropertiesExpanded })
          }}
          DetailsPaneOverride={this.props.DetailsPaneOverride}
          OverviewPaneOverride={this.props.OverviewPaneOverride}
        />
      </StyledFullSizeContainer>
    )
  }

  componentWillUnmount(): void {
    this.mounted = false
  }
}
