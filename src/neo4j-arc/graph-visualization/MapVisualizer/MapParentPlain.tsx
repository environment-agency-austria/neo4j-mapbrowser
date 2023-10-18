import React, { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

import { register } from 'ol/proj/proj4'
import * as proj4x from 'proj4'
const proj4 = (proj4x as any).default

import OLMap from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM'
import TileWMS from 'ol/source/TileWMS'
import WMSGetFeatureInfo from 'ol/format/WMSGetFeatureInfo'

import * as olProj from 'ol/proj'
import { NodeModel } from '../models/Node'
import { VizItem } from '../types'
import { GraphModel } from '../models/Graph'
import { GraphEventHandlerModel } from '../GraphVisualizer/Graph/GraphEventHandlerModel'
import { fetchFeaturesFromGmlURL } from './fetch_features'
import { Collection, Feature } from 'ol'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { Geometry } from 'ol/geom'
import { WFS } from 'ol/format'
import GML32 from 'ol/format/GML32'

export type MapParentPlainProps = {
  mapPosition: [number, number]
  syncGraphWithMap(zoom: number, zoomDetailLevel: number, bounds: any): void
  selectedItem: VizItem
  graph?: GraphModel
  geh?: GraphEventHandlerModel
  auStyle: 'bundeslaender' | 'bezirke' | 'gemeinden'
}

async function loadFeatures(
  selectedItem: VizItem,
  featureCache: Map<string, Feature<Geometry> | null>
) {
  const selId = (selectedItem.item as NodeModel).propertyList.find(
    p => p.key === 'gml:identiifer'
  )?.value
  if (selId) {
    fetch(selId)
      .then(response => response.text())
      .then(gml => {
        const parser = new WFS({
          featureNS: 'http://mapserver.gis.umn.edu/mapserver',
          version: '2.0.0'
        })

        const wfsFeatures = parser.readFeatures(gml)
        const gmlString = new GML32({
          srsName: 'urn:ogc:def:crs:EPSG::4326',
          featureNS: 'swaat'
        }).writeFeatures(wfsFeatures)
      })
  }
  console.log(selId)
  console.log(featureCache.size)
}

export function MapParentPlain(props: MapParentPlainProps) {
  //TODO: Use correct transformation
  useEffect(() => {
    proj4.defs(
      'EPSG:31287',
      '+proj=lcc +axis=neu +lat_0=47.5 +lon_0=13.3333333333333 +lat_1=49 +lat_2=46 +x_0=400000 +y_0=400000 +ellps=bessel +towgs84=577.326,90.129,463.919,5.137,1.474,5.297,2.42319999999019 +units=m +no_defs +type=crs'
    )
    proj4.defs(
      'EPSG:31258',
      '+proj=tmerc +lat_0=0 +lon_0=13.3333333333333 +k=1 +x_0=450000 +y_0=-5000000 +ellps=bessel +towgs84=577.326,90.129,463.919,5.137,1.474,5.297,2.4232 +units=m +no_defs +type=crs'
    )
    proj4.defs(
      'EPSG:3035',
      '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=565.04,49.91,465.84,1.9848,-1.7439,9.0587,4.0772 +units=m +no_defs +type=crs'
    )
    register(proj4)
  }, [])

  console.log(props)

  useEffect(() => {
    /* var container = L.DomUtil.get("map");

        if (container != null) {
            // @ts-ignore
            container._leaflet_id = null;
        }

        var map = L.map("map").setView(props.mapPosition, 6);

        var auLayer = L.tileLayer.WMS('https://geoserver-admin.rest-gdi.geo-data.space/geoserver/au/wms?service=WMS&', {
            layers: 'au:AdministrativUnits',
            transparent: true,
            format: 'image/png',
            styles : 'gemeinden'
          }).addTo(map);

         var psLayer = L.tileLayer.WMS('https://geoserver-admin.rest-gdi.geo-data.space/geoserver/ps/wms?service=WMS&', {
            layers: 'ps:ProtectedSite',
            transparent: true,
            format: 'image/png'
          }).addTo(map);


          map.on('click', e => {
            psLayer.get
          });
          */
  }, [])

  const currentProps = useRef(props)
  currentProps.current = props

  const featureCache = useRef(new Map<string, Feature<Geometry> | null>())
  const selectedFeatures = useRef(new Collection<Feature<Geometry>>())

  const mapTargetElement = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<OLMap | undefined>()
  const [auLayer, setAuLayer] = useState<TileLayer<TileWMS> | undefined>()

  if (props.selectedItem && props.selectedItem.type === 'node') {
    loadFeatures(props.selectedItem, featureCache.current)
  }

  useEffect(() => {
    const view = new View({
      center: props.mapPosition,
      zoom: 6,
      minZoom: 0,
      maxZoom: 28
    })

    const psLayer = new TileLayer({
      source: new TileWMS({
        url: 'https://geoserver2-admin.rest-gdi.geo-data.space/geoserver/ps/wms?service=WMS',
        params: { LAYERS: 'ps:ProtectedSite', TILED: true },
        serverType: 'geoserver',
        transition: 0
      })
    })

    const selectLayer = new VectorLayer({
      source: new VectorSource({
        features: selectedFeatures.current
      })
    })

    const map = new OLMap({
      layers: [new TileLayer({ source: new OSM() }), psLayer, selectLayer],

      controls: [],

      view: view
    })

    view.on('change', () => {
      const extent = view.calculateExtent(map.getSize())
      const zoom = view.getZoom() ?? 0
      // 'EPSG:31287'

      const extentTransformed = olProj.transformExtent(
        extent,
        view.getProjection(),
        'EPSG:3035'
      )

      props.syncGraphWithMap(zoom, 10, extentTransformed)
    })

    map.on('singleclick', e => {
      const viewResolution = view.getResolution() ?? 0
      console.log(view.getCenter())
      const url = psLayer
        .getSource()
        ?.getFeatureInfoUrl(e.coordinate, viewResolution, 'EPSG:3857', {
          INFO_FORMAT: 'text/plain'
        })
      if (url) {
        fetch(url)
          .then(response => response.text())
          .then(txt => {
            const idPos = txt.indexOf('id=') + 3
            const startTrimmed = txt.substring(idPos)
            const id = startTrimmed.substring(0, startTrimmed.indexOf('>'))
            console.log(id)

            if (currentProps.current.graph && currentProps.current.geh) {
              const selectedNode = currentProps.current.graph
                .nodes()
                .find(n =>
                  n.propertyList.find(p => p.key === 'gml:id' && p.value === id)
                )
              if (selectedNode) {
                currentProps.current.geh.selectItem(selectedNode)
              }
            }
          })
      }
    })

    /*        map.on('pointermove', e => {
            if (e.dragging) {
              return;
            }
            const psData = psLayer.getData(e.pixel);
            console.log(psData)
            //const auData = auLayer.getData(e.pixel);
            //const hit = (psData && psData[3] > 0); // transparent pixels have zero for data[3]
            //map.getTargetElement().style.cursor = hit ? 'pointer' : '';
          });
*/
    map.setTarget(mapTargetElement.current || '')
    setMap(map)
    return () => map.setTarget('')
  }, [])

  useEffect(() => {
    if (auLayer) {
      map?.removeLayer(auLayer)
    }

    const newAuLayer = new TileLayer({
      source: new TileWMS({
        url: 'https://geoserver-admin.rest-gdi.geo-data.space/geoserver/au/wms?service=WMS',
        params: {
          LAYERS: 'au:AdministrativUnits',
          TILED: true,
          STYLES: props.auStyle
        },
        serverType: 'geoserver',
        transition: 0
      })
    })

    setAuLayer(newAuLayer)
    map?.addLayer(newAuLayer)
  }, [props.auStyle, map])

  useEffect(() => {
    if (props.selectedItem.type == 'node') {
      const url = (props.selectedItem.item as NodeModel).propertyMap[
        'gml:identifier'
      ]
      console.log(url)
    }
  }, [props.selectedItem])

  return (
    <>
      <div
        ref={mapTargetElement}
        className="map"
        style={{
          width: '100%',
          height: '100%',
          position: 'relative'
        }}
      ></div>
    </>
  )
}
