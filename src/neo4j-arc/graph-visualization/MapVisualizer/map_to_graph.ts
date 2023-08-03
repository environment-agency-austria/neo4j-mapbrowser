import { BasicNode, BasicNodesAndRels } from '../../common/types/arcTypes'
import { GraphModel } from '../models/Graph'
import { GraphEventHandlerModel } from '../GraphVisualizer/Graph/GraphEventHandlerModel'
import { mapNodes, mapRelationships } from '../utils/mapper'
import * as olProj from 'ol/proj'
import { GeoNodeInfo } from './types'

function setGraphNodes(
  newNodesAndRels: BasicNodesAndRels,
  g?: GraphModel,
  geh?: GraphEventHandlerModel
) {
  if (g && geh) {
    const newNodeIDs = new Set(newNodesAndRels.nodes.map(n => n.id))
    const existingNodeIDS = new Set(g.nodes().map(n => n.id))

    //remove all current nodes not contained in the new node-list
    g.nodes()
      .filter(n => !newNodeIDs.has(n.id))
      .forEach(n => {
        g.removeConnectedRelationships(n)
        g.removeNode(n)
      })

    console.log('nodes survived: ' + g.nodes().length)

    const createNodes = newNodesAndRels.nodes.filter(
      n => !existingNodeIDS.has(n.id)
    )

    const nodeModel = mapNodes(createNodes)
    g.addNodes(nodeModel)

    //TODO: Filter relationships
    const relModel = mapRelationships(newNodesAndRels.relationships, g)
    g.addRelationships(relModel)

    geh.visualization.update({
      updateNodes: true,
      updateRelationships: true,
      restartSimulation: true
    })
    geh.graphModelChanged()
  }
}

function generateNodeBoundsQuery(bounds: any) {
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

  return query
}

export { setGraphNodes, generateNodeBoundsQuery }
