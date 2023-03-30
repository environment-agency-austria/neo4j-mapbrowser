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
  useEffect
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
import { GraphStats } from '../utils/mapper'
import { GraphModel } from '../models/Graph'
import { GraphInteractionCallBack } from './Graph/GraphEventHandlerModel'
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
import { register } from 'ol/proj/proj4'
import * as proj4x from 'proj4'
import VectorLayer from 'ol/layer/Vector'
import { Feature } from 'ol'
const proj4 = (proj4x as any).default

const DEFAULT_MAX_NEIGHBOURS = 100

type MapParentProps = {
  zoomLevel: number
  nodes: BasicNode[]
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

async function fetchFeaturesFromGmlURL(gmlURL: string): Promise<GeoJsonObject> {
  const parser = new WFS({
    featureNS: 'http://mapserver.gis.umn.edu/mapserver',
    version: '2.0.0'
  })

  return fetch(gmlURL)
    .then(response => response.text())
    .then(data => {
      const wfsFeatures = parser.readFeatures(data)
      const gmlString = new GML32({
        srsName: 'urn:ogc:def:crs:EPSG::4326',
        featureNS: 'swaat'
      }).writeFeatures(wfsFeatures)

      const gjs = JSON.parse(
        new OLGeoJson().writeFeatures(wfsFeatures, {
          featureProjection: 'EPSG:31287',
          dataProjection: 'EPSG:4326'
        })
      ) as GeoJsonObject

      return gjs
    })
}

export const MapParent = (props: MapParentProps) => {
  const onEachFeature = (feature: any, layer: any) => {
    layer.on('click', () => {
      //this.state.
      const gmlId = feature.id
      alert('Feature selected: ' + feature.id)
      return null
    })
  }

  const [zoomLevel, setZoomLevel] = useState(8)
  const [geodata, setGeoData] = useState<GeoJsonObject>({ type: 'Feature' })
  const [processedURLs, setProcessedURLs] = useState<string[]>([])

  useEffect(() => {
    const gmlURLs = props.nodes
      .filter(node => 'gml:identifier' in node.properties)
      .map(node => node.properties['gml:identifier'])

    // check whether re-fetch is required at all
    if (JSON.stringify(processedURLs) === JSON.stringify(gmlURLs)) {
      return
    }
    setProcessedURLs(gmlURLs)

    proj4.defs(
      'EPSG:31287',
      '+proj=lcc +axis=neu +lat_0=47.5 +lon_0=13.3333333333333 +lat_1=49 +lat_2=46 +x_0=400000 +y_0=400000 +ellps=bessel +towgs84=577.326,90.129,463.919,5.137,1.474,5.297,2.42319999999019 +units=m +no_defs +type=crs'
    )
    register(proj4)

    const pendingFetches = gmlURLs.map(gmlURL => {
      return fetchFeaturesFromGmlURL(gmlURL).catch(e =>
        console.log('Error fetching url: ' + gmlURL + ' ' + e)
      )
    })

    Promise.all(pendingFetches).then(f => {
      try {
        const loadedFeatureCollections = f as FeatureCollection[]
        const featureCollection: FeatureCollection = {
          type: 'FeatureCollection',
          features: []
        }
        loadedFeatureCollections.forEach(lfc =>
          featureCollection.features.push(lfc.features[0])
        )
        setGeoData(featureCollection)
      } catch (e) {
        console.log(e)
      }
    })
  })

  const position = [47.35, 13.63]

  let layer
  if (zoomLevel > 12) {
    layer = (
      <GeoJSON
        key={Math.random()}
        data={geodata}
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

  return (
    <div style={{ width: '100%', height: '100%' }}>
      {zoomLevel}
      <MapContainer
        style={{ width: '100%', height: '100%', zIndex: 1 }}
        center={position}
        zoom={8}
        scrollWheelZoom={true}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {layer}

        <ZoomHandler onZoomChange={setZoomLevel} />

        {/*<GeoJSON key={Math.random()} data={null}  
                  // @ts-expect-error
                  onEachFeature={onEachFeature} 
pathOptions={{ color: 'red', weight : 1 }}/> */}
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
  relationships: BasicRelationship[]
  selectedItem: VizItem
  stats: GraphStats
  styleVersion: number
  freezeLegend: boolean
  width: number
  nodePropertiesExpanded: boolean
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
      nodePropertiesExpanded: nodePropertiesExpandedByDefault
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

  render(): JSX.Element {
    // This is a workaround to make the style reset to the same colors as when starting the browser with an empty style
    // If the legend component has the style it will ask the neoGraphStyle object for styling before the graph component,
    // and also doing this in a different order from the graph. This leads to different default colors being assigned to different labels.
    const graphStyle = this.state.freezeLegend
      ? new GraphStyleModel(this.props.useGeneratedDefaultColors)
      : this.state.graphStyle

    return (
      <StyledFullSizeContainer id="svg-vis">
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
          setGraph={this.props.setGraph}
          offset={
            (this.state.nodePropertiesExpanded ? this.state.width + 8 : 0) + 8
          }
          wheelZoomRequiresModKey={this.props.wheelZoomRequiresModKey}
          wheelZoomInfoMessageEnabled={this.props.wheelZoomInfoMessageEnabled}
          disableWheelZoomInfoMessage={this.props.disableWheelZoomInfoMessage}
          initialZoomToFit={this.props.initialZoomToFit}
          onGraphInteraction={this.props.onGraphInteraction}
        />

        <MapParent zoomLevel={8} nodes={this.props.nodes} />

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
