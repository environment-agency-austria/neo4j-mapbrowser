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
  useRef,
  useReducer
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
  WMSTileLayer,
  LayersControl
} from 'react-leaflet'
import { GeoJsonObject, FeatureCollection } from 'geojson'

import { WFS, GML } from 'ol/format'
import GML32 from 'ol/format/GML32'
import { GeoJSON as OLGeoJson } from 'ol/format'
import { LineString, Point } from 'ol/geom'

import { register } from 'ol/proj/proj4'
import * as proj4x from 'proj4'
import VectorLayer from 'ol/layer/Vector'
import { Feature } from 'ol'
import { SyncPanel } from './SyncPanel'
const proj4 = (proj4x as any).default

import { MapParent } from '../MapVisualizer/MapParent'
import { convertBasicNodesToGeoNodeInfo } from '../MapVisualizer/graph_to_map'

import { GeoNodeInfo } from '../MapVisualizer/types'
import {
  generateNodeBoundsQuery,
  setGraphNodes
} from '../MapVisualizer/map_to_graph'

const DEFAULT_MAX_NEIGHBOURS = 100

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
  relationships: BasicRelationship[]
  selectedItem: VizItem
  stats: GraphStats
  styleVersion: number
  freezeLegend: boolean
  width: number
  nodePropertiesExpanded: boolean
  /* map related additions */
  nodeURLs: GeoNodeInfo[]
  mapGraph?: BasicNodesAndRels
  hiddenLayers: string[]
  loadedLayers: string[]
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
      nodeURLs: [],
      hiddenLayers: [],
      loadedLayers: []
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

  setGraph = (g: GraphModel) => {
    this.props.setGraph(g)
    this.g = g
  }

  setGraphEventHandlerModel = (handler: GraphEventHandlerModel) => {
    this.geh = handler
  }

  syncOptionsChanged = (syncWithMapBound: boolean, syncWithGraph: boolean) => {
    if (syncWithMapBound && this.state.mapGraph) {
      //restore graph based on what was fetched for map before
      setGraphNodes(this.state.mapGraph, this.g, this.geh)
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

  syncGraphWithMap = (zoom: number, zoomDetailLevel: number, bounds: any) => {
    if (!this.state.syncWithMap) {
      return
    }

    // wenn grob, keine Daten laden (nur für getFeatureInfo)
    if (zoom < zoomDetailLevel) {
      setGraphNodes({ nodes: [], relationships: [] }, this.g, this.geh)
      return
    }

    const query = generateNodeBoundsQuery(bounds)
    console.log(query)
    this.props.updateQuery?.(query).then(resultGraph => {
      const nodeInfo = convertBasicNodesToGeoNodeInfo(resultGraph.nodes)
      const loadedLayers = Array.from(
        new Set(nodeInfo.flatMap(ni => ni.layers))
      ).sort()

      this.setState({
        nodes: resultGraph.nodes,
        mapGraph: resultGraph,
        nodeURLs: nodeInfo,
        loadedLayers: loadedLayers
      })

      console.log('number of nodes returned: ' + resultGraph.nodes.length)
      if (this.state.syncWithMap) {
        setGraphNodes(resultGraph, this.g, this.geh)
      }
    })
  }

  syncMapWithGraph = () => {
    if (this.g) {
      console.log('nodes there: ' + this.g?.nodes().length)

      const urlList = this.g
        ?.nodes()
        .filter(n => n.propertyMap['gml:identifier'])
        .map(n => ({ url: n.propertyMap['gml:identifier'], layers: n.labels }))

      if (JSON.stringify(urlList) !== JSON.stringify(this.state.nodeURLs)) {
        this.setState({ nodeURLs: urlList })
      }
    }
  }

  hiddenLayersChanged = (layers: string[]) => {
    this.setState({ hiddenLayers: layers })
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

    //const nodeURLs = this.convertBasicNodesToURL(this.state.nodes)

    return (
      <StyledFullSizeContainer id="svg-vis">
        <div style={{ position: 'absolute', top: '30px', zIndex: 1000 }}>
          <SyncPanel
            syncWithMapBounds={this.state.syncWithMap}
            syncWithGraph={this.state.syncWithGraph}
            syncOptionsChanged={this.syncOptionsChanged}
            layers={this.state.loadedLayers}
            hiddenLayersChanged={this.hiddenLayersChanged}
          />
        </div>

        <Graph
          isFullscreen={this.props.isFullscreen}
          relationships={this.state.relationships}
          nodes={this.state.nodes}
          getNodeNeighbours={this.getNodeNeighbours}
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
          nodeURLs={
            this.state.nodeURLs
              .filter(n => !this.state.hiddenLayers.includes(n.layers[0])) // || this.state.syncWithGraph) //TODO: Hack to avoid unknown layer bug
              .map(n => n.url) /*TODO: only checks for first layer*/
          }
          syncGraphWithMap={this.syncGraphWithMap}
          syncWithMap={this.state.syncWithMap}
          syncWithGraph={this.state.syncWithGraph}
          selectedItem={this.state.selectedItem}
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
          updateQuery={this.props.updateQuery}
        />
      </StyledFullSizeContainer>
    )
  }

  componentWillUnmount(): void {
    this.mounted = false
  }
}
