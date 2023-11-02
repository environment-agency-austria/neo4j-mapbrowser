import { BasicNode, BasicNodesAndRels } from 'neo4j-arc/common'
import { GeoNodeInfo } from './types'
import { VizItem } from '../types'
import * as olProj from 'ol/proj'
import { NodeModel } from '../models/Node'
import { GraphModel } from '../models/Graph'

type UrlLayerPair = {
  url: string
  layers: string[]
}

function getGmlUrlsFromNodes(graph: GraphModel): UrlLayerPair[] {
  return graph
    .nodes()
    .filter(n => n.propertyMap['gml:identifier'])
    .map(n => ({ url: n.propertyMap['gml:identifier'], layers: n.labels }))
}

function getGmlUrlFromNode(node: NodeModel) {
  return node.propertyList.find(p => p.key === 'gml:identifer')?.value
}

function convertBasicNodesToGeoNodeInfo(nodes: BasicNode[]): GeoNodeInfo[] {
  const containedURLs = new Set<string>()

  return nodes
    .filter(node => 'gml:identifier' in node.properties)
    .filter(node => {
      if (!containedURLs.has(node.properties['gml:identifier'])) {
        containedURLs.add(node.properties['gml:identifier'])
        return true
      }
      return false
    })
    .map(node => {
      const url = node.properties['gml:identifier']
      return { url: url, layers: node.labels }
    })
    .sort((n1, n2) => (n1.layers[0] > n2.layers[0] ? 1 : -1))
  //.filter(node => node.labels.filter(l => selectedLayers.includes(l)).length > 0)
}

export {
  UrlLayerPair,
  convertBasicNodesToGeoNodeInfo,
  getGmlUrlFromNode,
  getGmlUrlsFromNodes
}
