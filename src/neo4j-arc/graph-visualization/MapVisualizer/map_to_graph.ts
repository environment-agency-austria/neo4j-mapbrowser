import { BasicNodesAndRels } from '../../common/types/arcTypes'
import { GraphModel } from '../models/Graph'
import { GraphEventHandlerModel } from '../GraphVisualizer/Graph/GraphEventHandlerModel'
import { mapNodes, mapRelationships } from '../utils/mapper'

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
  const southWestTrx = [bounds[2], bounds[3]]
  const northEastTrx = [bounds[0], bounds[1]] //olProj.fromLonLat([bounds[2], bounds[3]], 'EPSG:31287');

  const query =
    'MATCH(n:Schutzgebiet) WHERE ' +
    '     n.x_max >= ' +
    northEastTrx[0] +
    ' AND n.y_max >= ' +
    northEastTrx[1] +
    ' AND n.x_min <= ' +
    southWestTrx[0] +
    ' AND n.y_min <= ' +
    southWestTrx[1] +
    ' OPTIONAL MATCH (n)-[r]-(m) return n, r, m;'

  /*
        ' MATCH(m) WHERE ' +
    '     m.x_max >= ' +
    northEastTrx[0] +
    ' AND m.y_max >= ' +
    northEastTrx[1] +
    ' AND m.x_min <= ' +
    southWestTrx[0] +
    ' AND m.y_min <= ' +
    southWestTrx[1] +
    */

  return query
}

export { setGraphNodes, generateNodeBoundsQuery }
