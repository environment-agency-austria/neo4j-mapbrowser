import { BasicNode, BasicNodesAndRels } from 'neo4j-arc/common'
import { GeoNodeInfo } from './types'
import { VizItem } from '../types'
import * as olProj from 'ol/proj'
import { NodeModel } from '../models/Node'
import { GraphModel } from '../models/Graph'
import { GML_IDENTIFIER_KEY, WKT_KEY } from '../config'

type UrlLayerPair = {
  url: string
  wkt: string | undefined
  layers: string[]
}

function getGmlUrlsFromNodes(graph: GraphModel): UrlLayerPair[] {
  // return graph
  //   .nodes()
  //   .filter(n => n.propertyMap[GML_IDENTIFIER_KEY])
  //   .map(n => ({ url: n.propertyMap[GML_IDENTIFIER_KEY], layers: n.labels }))

  const urlList = graph
    ?.nodes()
    .filter(n => n.propertyMap[GML_IDENTIFIER_KEY] || n.propertyMap[WKT_KEY])
    .map(n => getGmlUrlLayerPairFromNode(n))
    .sort((a: UrlLayerPair, b: UrlLayerPair) => a.url.localeCompare(b.url))
  return urlList
}

function getGmlUrlLayerPairFromNode(n: NodeModel): UrlLayerPair {
  return {
    url: n.propertyMap[GML_IDENTIFIER_KEY],
    wkt: n.propertyMap[WKT_KEY],
    layers: n.labels
  } //node.propertyList.find(p => p.key === GML_IDENTIFIER_KEY)?.value
}

function convertBasicNodesToGeoNodeInfo(nodes: BasicNode[]): GeoNodeInfo[] {
  const containedURLs = new Set<string>()

  return nodes
    .filter(node => GML_IDENTIFIER_KEY in node.properties)
    .filter(node => {
      if (!containedURLs.has(node.properties[GML_IDENTIFIER_KEY])) {
        containedURLs.add(node.properties[GML_IDENTIFIER_KEY])
        return true
      }
      return false
    })
    .map(node => {
      const url = node.properties[GML_IDENTIFIER_KEY]
      return { url: url, layers: node.labels }
    })
    .sort((n1, n2) => (n1.layers[0] > n2.layers[0] ? 1 : -1))
  //.filter(node => node.labels.filter(l => selectedLayers.includes(l)).length > 0)
}

export {
  UrlLayerPair,
  convertBasicNodesToGeoNodeInfo,
  getGmlUrlLayerPairFromNode,
  getGmlUrlsFromNodes
}
