import { BasicNodesAndRels } from '../../common/types/arcTypes'
import { GraphModel } from '../models/Graph'
import { GraphEventHandlerModel } from '../GraphVisualizer/Graph/GraphEventHandlerModel'
import { mapNodes, mapRelationships } from '../utils/mapper'
import { Feature } from 'ol'
import { Geometry } from 'ol/geom'
import { FeatureLike } from 'ol/Feature'
import { NodeModel } from '../models/Node'
import { GML_IDENTIFIER_KEY, MAIN_NODE_LABEL } from '../config'

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

function getNodeById(selid: string, graph: GraphModel) {
  return graph
    .nodes()
    .find(n =>
      n.propertyList.find(
        p => p.key === GML_IDENTIFIER_KEY && p.value === selid
      )
    )
}

function selectNodeById(
  selid?: string,
  graph?: GraphModel,
  geh?: GraphEventHandlerModel
) {
  if (graph && geh) {
    if (selid) {
      const selectedNode = getNodeById(selid, graph)

      if (selectedNode) {
        geh.selectItem(selectedNode)
        geh.onItemSelected({
          type: 'node',
          item: selectedNode
        })

        return selectedNode
      }
    }
    //TODO: Implement reseting selection
  }

  return
}

export function getNodeBoundingBoxFilter(bounds: any) {
  //olProj.fromLonLat([bounds[2], bounds[3]], 'EPSG:31287');

  const southWestTrx = [bounds[2], bounds[3]]
  const northEastTrx = [bounds[0], bounds[1]]
  return (
    '     n.x_max >= ' +
    northEastTrx[0] +
    ' AND n.y_max >= ' +
    northEastTrx[1] +
    ' AND n.x_min <= ' +
    southWestTrx[0] +
    ' AND n.y_min <= ' +
    southWestTrx[1]
  )
}

export function appendBoundindBoxFilterToQuery(
  bounds: any,
  originalQuery: string,
  versionId?: string
) {
  const returnPosition = originalQuery.indexOf('return')
  const originalQueryWithoutReturn = originalQuery.substring(0, returnPosition)
  let bboxAppended =
    originalQueryWithoutReturn +
    'WITH n WHERE' +
    getNodeBoundingBoxFilter(bounds)
  if (versionId && versionId.length > 0) {
    bboxAppended += ` AND n.versionId="${versionId}"`
  }
  bboxAppended += ' return n limit 300;'
  return bboxAppended
}

export function generateNodeBoundsQuery(bounds: any, versionId: string) {
  console.log(versionId)

  // const query =
  //   'MATCH(n:FT_Invekos_Flurstuecke) WHERE ' +
  //   ` point.withinBBox(n.min, point({x: ${northEastTrx[0]}, y: ${northEastTrx[1]}, crs:"cartesian"}), point({x: ${southWestTrx[0]}, y: ${southWestTrx[1]}, crs:"cartesian"}))  ` +
  //   " OR " +
  //   ` point.withinBBox(n.max, point({x: ${northEastTrx[0]}, y: ${northEastTrx[1]}, crs:"cartesian"}), point({x: ${southWestTrx[0]}, y: ${southWestTrx[1]}, crs:"cartesian"}))  ` +
  //   'WITH n MATCH (n)-[v:Foerderprogramm]->(x:FT_Invekos_Flurstuecke_Version{foerderart : "MFA2024"})' +
  //   ' OPTIONAL MATCH (n)-[r]-(m) return n, r, mf';

  let query =
    `MATCH(n:${MAIN_NODE_LABEL}) WHERE ` + getNodeBoundingBoxFilter(bounds)
  if (versionId && versionId.length > 0) {
    query += ` AND n.versionId="${versionId}"`
  }
  query += ' return n limit 300'

  // ' WITH n MATCH (x)-[v:Foerderprogramm]->(n)' +
  // '  return n, v, x ';

  //OPTIONAL MATCH (n)-[r]-(m{foerderart : "MFA2024"})

  console.log(query)

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

export { setGraphNodes, getNodeById, selectNodeById }
