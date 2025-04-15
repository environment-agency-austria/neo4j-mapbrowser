const urlParams = new URLSearchParams(window.location.search)

export const GEOJSON_PROJ = urlParams.get('geojson_proj') as string // "EPSG:31287";
export const GML_IDENTIFIER_KEY = urlParams.get('id_property') as string //"gml_identifier_public";
export const WKT_KEY = urlParams.get('wkt_key') as string // "WKT";
export const DATA_LAYERS = JSON.parse(urlParams.get('data_layers') as string)
export const MAIN_NODE_LABEL =
  urlParams.get('main_node_label') ?? 'FT_Invekos_Schlaege_Version' //default to FT_Invekos_Schlaege_Version, as this parameter was introduced after the final URLs were published
/*
[ 
{
    "WMS_URL" : "https://geoserver.rest-gdi.geo-data.space/geoserver/ows?SERVICE=WMS",
    "LAYERS" : ["invekos:FT_INVEKOS_Schlaege_public"],
    "PROJECTION" : "EPSG:31287"
} 
]
*/
const versionids_parsed = JSON.parse(
  urlParams.get('version_filters') as string
) as string[]

export const VERSIONIDS = versionids_parsed ?? []

console.log(VERSIONIDS)
console.log(DATA_LAYERS)
console.log(WKT_KEY)
console.log(GML_IDENTIFIER_KEY)
console.log(GEOJSON_PROJ)

// currently unused

// export const DATA_LAYERS = [ {
//         WMS_URL : 'https://geoserver-admin-rest-gdi.agrarforschung.at/geoserver/rest-gdi-agrar/wms?SERVICE=WMS',
//         LAYERS : ['rest-gdi-agrar:FT_INVEKOS_Flurstuecke_public'],
//         PROJECTION : 'EPSG:31287'
//     } ,
//     {
//         WMS_URL : 'https://geoserver-admin-rest-gdi.agrarforschung.at/geoserver/rest-gdi-agrar/wms?SERVICE=WMS',
//         LAYERS : ['rest-gdi-agrar:FT_INVEKOS_Schlaege_public'],
//         PROJECTION : 'EPSG:31287'
//     }
// ];
