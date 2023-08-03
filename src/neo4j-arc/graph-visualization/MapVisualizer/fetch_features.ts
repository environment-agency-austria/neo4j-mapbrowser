import { WFS, GML } from 'ol/format'
import GML32 from 'ol/format/GML32'
import * as olProj from 'ol/proj'
import { GeoJSON as OLGeoJson } from 'ol/format'
import { Geometry, LineString, Point } from 'ol/geom'
import { BoundingBoxHandler } from './BoundingBoxHandler'
import { FeatureCollection } from 'geojson'
import { computeBoundingBox } from './geo_utils'
import { Feature } from 'ol'

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

function urlsToFeatureCollection(
  loadedFeatures: Map<string, Feature<Geometry> | null>,
  nodeURLs: string[]
): {
  collection: FeatureCollection
  shownURLs: Set<string>
} {
  const featureCollection: FeatureCollection = {
    type: 'FeatureCollection',
    features: []
  }

  const urls = new Set<string>()
  nodeURLs.forEach(url => {
    const feature = loadedFeatures.get(url)
    if (feature && feature != null) {
      // @ts-ignore
      featureCollection.features.push(feature)
      urls.add(url)
    }
  })

  return { collection: featureCollection, shownURLs: urls }
}

async function loadMissingMapData(
  loadedFeatures: Map<string, Feature<Geometry> | null>,
  nodesURLs: string[]
): Promise<boolean> {
  const gmlURLs = nodesURLs

  // fetch only urls which have not been fetched before
  let unfetchedURLs = gmlURLs.filter(url => !loadedFeatures.has(url))
  if (unfetchedURLs.length > 0) {
    unfetchedURLs = [...new Set(unfetchedURLs)]
    unfetchedURLs.forEach(url => loadedFeatures.set(url, null))

    const pendingFetches = unfetchedURLs.map(gmlURL => {
      console.log('start fetching of: ' + gmlURL)
      return fetchFeaturesFromGmlURL(gmlURL).catch(e =>
        console.log('Error fetching url: ' + gmlURL + ' ' + e)
      )
    })

    return Promise.all(pendingFetches).then(f => {
      try {
        const fNotVoid = f as { geodata: FeatureCollection; url: string }[]
        fNotVoid.forEach(res => {
          // @ts-ignore
          loadedFeatures.set(res.url, res.geodata.features[0])
        })

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

        return true
      } catch (e) {
        console.log(e)
      }

      return false
    })
  }

  return false
}

export { fetchFeaturesFromGmlURL, urlsToFeatureCollection, loadMissingMapData }
