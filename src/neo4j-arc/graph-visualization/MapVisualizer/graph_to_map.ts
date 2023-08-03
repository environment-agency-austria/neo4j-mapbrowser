import { BasicNode, BasicNodesAndRels } from 'neo4j-arc/common'
import { GeoNodeInfo } from './types'
import { VizItem } from '../types'
import * as olProj from 'ol/proj'

function calcMapCenterFromVizItem(
  selectedItem: VizItem
): [number, number] | null {
  // eventuell in main - re-render will happen anyway
  if (selectedItem.type === 'node') {
    const x1 = parseFloat(
      selectedItem.item.propertyList.find(p => p.key == 'x1')?.value || '0'
    )
    const y1 = parseFloat(
      selectedItem.item.propertyList.find(p => p.key == 'y1')?.value || '0'
    )
    const x2 = parseFloat(
      selectedItem.item.propertyList.find(p => p.key == 'x2')?.value || '0'
    )
    const y2 = parseFloat(
      selectedItem.item.propertyList.find(p => p.key == 'y2')?.value || '0'
    )

    if (x1 > 0) {
      const top = olProj.toLonLat([x1, y1], 'EPSG:31287')
      //const bottom = olProj.toLonLat([x2, y2], 'EPSG:4326');
      console.log(JSON.stringify(top))
      return [top[1], top[0]]
    }
  }

  return null
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

export { calcMapCenterFromVizItem, convertBasicNodesToGeoNodeInfo }
