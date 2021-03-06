var L = require('./leaflet');
require('./leaflet.measure');
require('./MovingMarker');
require('./leaflet.label');
require('leaflet-polylinedecorator')
var finder = require('finderjs');
var _ = require('./util');
var $ = require('./jquery-1.12.0.min.js');

L.Icon.Default.imagePath = './images';
var tileLayer;
var ua = window.navigator.userAgent;
var msie = ua.indexOf("MSIE ");

if (msie > 0) {
  tileLayer = L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18
  });
}
else {
  tileLayer = Tangram.leafletLayer({
    scene: 'https://raw.githubusercontent.com/tangrams/refill-style/gh-pages/refill-style.yaml',
    attribution: '<a href="https://mapzen.com/tangram" target="_blank">Tangram</a> | <a href="http://www.openstreetmap.org/about" target="_blank">&copy; OSM contributors | <a href="https://mapzen.com/" target="_blank">Mapzen</a>',
    errorTileUrl: 'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
  });
}

var map = new L.Map('map', {
  touchZoom: false,
  measureControl: true
}).addLayer(tileLayer).setView(new L.LatLng(37.7, -122.4), 6);

var rspLayer = L.layerGroup();
rspLayer.addTo(map);
var stopLayer = L.layerGroup();
stopLayer.addTo(map);
var movingMarker;

var animateControl = L.Control.extend({
  options: {
      position: 'topleft',
      on: false
  },

  onAdd: function(map) {
    var container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
    container = this.greenArrow(container);
    var ac = this;
    container.onclick = function(){
      ac.toggle();
    }
    return container;
  },

  greenArrow: function(container) {
    container.style.backgroundColor = 'white';
    container.style.width = '0px';
    container.style.height = '0px';
    container.style.borderTop = '13px solid transparent';
    container.style.borderBottom = '12px solid transparent';
    container.style.borderLeft = '25px solid #11cc00';
    return container;
  },

  redSquare: function(container) {
    container.style.backgroundColor = 'red';
    container.style.width = '25px';
    container.style.height = '25px';
    container.style.borderTop = '';
    container.style.borderBottom = '';
    container.style.borderLeft = '';
    return container;
  },

  toggle: function() {
    if (!this.options.on && rspLayer.getLayers().length > 0) {
      var coords = rspLayer.getLayers()[0].getLatLngs();
      var numbers = new Array(coords.length);
      numbers.fill(100);
      if (!movingMarker) movingMarker = L.Marker.movingMarker(coords,numbers,{loop: true}).addTo(map);
      movingMarker.start();
      this.options.on = true;
      this.redSquare(this._container);
    }
    else {
      if (movingMarker) {
        map.removeLayer(movingMarker);
        movingMarker = null;
      }
      this.options.on = false;
      this.greenArrow(this._container);
    }
  }

});

var ac = new animateControl();
map.addControl(ac);


var host = 'https://transit.land';
var pagination = {per_page: 1000, total: true};
var api_key = { api_key: 'transitland-gT34UDZ' };
var container = document.getElementById('finder');
var loadingIndicator = createLoadingColumn();
var emitter = finder(container, remoteSource, {header: 'Region'});

function remoteSource(parent, cfg, callback) {
  cfg.header = null;
  stopLayer.clearLayers();
  if (!parent || parent.type !== 'stop') {
    cfg.emitter.emit('create-column', loadingIndicator);
    rspLayer.clearLayers();
    ac.toggle();
  }
  if (parent) {
    if (parent.type === 'region') {
      cfg.header = 'Operator';
    }
    else if (parent.type === 'operator') {
      cfg.header = 'Route';
    }
    else if (parent.type === 'route') {
      cfg.header = 'RouteStopPattern';
    }
    else if (parent.type === 'rsp') {
      cfg.header = 'Stop';
    }
  }
  else {
    cfg.header = 'Region';
  }

  if (parent) {
    if (parent.type === 'region') {
      regionClicked(parent, cfg, callback);
    }
    else if (parent.type === 'operator') {
      operatorClicked(parent, cfg, callback);
    }
    else if (parent.type === 'route') {
      routeClicked(parent, cfg, callback);
    }
    else if (parent.type === 'rsp') {
      rspClicked(parent, cfg, callback);
    }
    else if (parent.type === 'stop') {
      stopClicked(parent.distance, parent.route_stop_pattern, parent.label, parent.previous, parent.next);
    } else {}
  }
  else {
    loadRegions(parent, cfg, callback);
  }

}

function loadRegions(parent, cfg, callback) {
   // for now region is operator.metro
   var finder_data = {};
   var operator_ids = [];
   function getOperators(importLevel, getCallback) {
     var params = {import_level: importLevel};
     $.extend(params,pagination,api_key);
     $.ajax({
       url: host + '/api/v1/operators.json?' + $.param(params),
       dataType: 'json',
       async: true,
       success: function(data) {
         getCallback(data);
       }
     });
   }

   function addOperators(data) {
     $.each(data.operators, function(i, operator) {
       if (!(operator_ids.indexOf(operator.onestop_id) != -1)) {
         if (operator.metro === null) operator.metro = 'Unknown';
         if (finder_data.hasOwnProperty(operator.metro)) {
           finder_data[operator.metro].operators.push(operator);
         }
         else {
           finder_data[operator.metro] = {
             id: operator.metro,
             label: operator.metro,
             type: 'region',
             operators: [operator]
           };
         }
         operator_ids.push(operator.onestop_id);
       }
     });
   }

   getOperators('2,3,4', function(operatorData){
     addOperators(operatorData);
     finder_data = $.map(finder_data, function(metro_data, index) {
       return [metro_data];
     }).sort(function (a, b) { return a.label.localeCompare(b.label); });
     callback(finder_data);
     _.remove(loadingIndicator);
   });
}

function regionClicked(parent, cfg, callback) {
  var finder_data = $.map(parent.operators, function(operator) {
    return {
      id: operator.onestop_id,
      label: operator.name + ' (' + operator.onestop_id + ')',
      type: 'operator'
    }
  });
  callback(finder_data);
  _.remove(loadingIndicator);
}

function operatorClicked(parent, cfg, callback) {
  var params = {operated_by: parent.id};
  $.extend(params,pagination,api_key);
  $.ajax({
    url: host + '/api/v1/routes.json?' + $.param(params),
    dataType: 'json',
    async: true,
    success: function(data) {
      var finder_data = $.map(data.routes, function(route) {
        return {
          id: route.onestop_id,
          label: route.name + ' (' + route.onestop_id + ')',
          type: 'route',
          route_stop_patterns: route.route_stop_patterns_by_onestop_id,
        }
      });
      callback(finder_data);
      _.remove(loadingIndicator);
    }
  });
}

function routeClicked(parent, cfg, callback) {
  var finder_data = $.map(parent.route_stop_patterns, function(rsp_id) {
    return {
      id: rsp_id,
      label: rsp_id,
      type: 'rsp'
    }
  });
  callback(finder_data);
  _.remove(loadingIndicator);
}

function rspClicked(parent, cfg, callback) {
  var rsp_onestop_id = parent.label;
  var params = {onestop_id: rsp_onestop_id};
  $.extend(params,pagination,api_key);
  $.ajax({
    url: host + '/api/v1/route_stop_patterns.geojson?' + $.param(params),
    dataType: 'json',
    async: true,
    success: function(data) {
      var stop_pattern = data.features[0].properties.stop_pattern;
      var stop_distances = data.features[0].properties.stop_distances;
      var finder_data = $.map(stop_pattern, function(stop_onestop_id, i) {
        var previous = (i != 0) ? stop_pattern[i-1] : null;
        var next = (i != stop_pattern.length - 1) ? stop_pattern[i+1] : null;
        var stop_distance = (!stop_distances || stop_distances.length == 0) ? null : stop_distances[i];
        return {
          id: stop_onestop_id,
          label: stop_onestop_id,
          type: 'stop',
          distance: stop_distance,
          route_stop_pattern: rsp_onestop_id,
          previous: previous,
          next: next
        }
      });
      displayRSP(data);
      callback(finder_data);
      _.remove(loadingIndicator);
    }
  });
}

function displayRSP(rsp_data) {
  var geojson = L.geoJson(rsp_data, {
    onEachFeature: function (feature, layer) {
      layer.bindPopup(feature.id);
      if (feature.properties['color']) layer.setStyle({color: '#' + feature.properties['color']});
      var p = L.polylineDecorator(layer, {patterns: [
          {repeat: 50, symbol: L.Symbol.arrowHead({pixelSize: 12, pathOptions: {fillOpacity: 1, weight: 0}}) }
        ]}
      );
      rspLayer.addLayer(layer);
      rspLayer.addLayer(p);
    }
  });
  map.fitBounds(geojson.getBounds());
}

function stopClicked(stop_distance, rsp_onestop_id, stop_onestop_id, previous, next) {
  if (!stop_distance) getDistanceFromSSP(rsp_onestop_id, previous, stop_onestop_id, next);
  else getStop(stop_onestop_id, stop_distance);
}

function getStop(stop_onestop_id, stop_distance) {
  var params = {onestop_id: stop_onestop_id};
  $.extend(params, pagination);
  $.ajax({
    url: host + '/api/v1/stops.geojson?' + $.param(params),
    dataType: 'json',
    async: true,
    success: function(stop_data) {
      var geojson = L.geoJson(stop_data, {
        onEachFeature: function (feature, layer) {
          layer.bindLabel(
            feature.id + '<br/>' + 'Distance traveled: ' +  stop_distance + ' meters',
            { noHide: true }
          );
        }
      });
      stopLayer.addLayer(geojson);
      map.fitBounds(geojson.getBounds());
    }
  });
}

function getDistanceFromSSP(rsp_onestop_id, previous_stop, this_stop, next_stop) {
  var params = {route_stop_pattern_onestop_id: rsp_onestop_id};
  if (previous_stop) {
    params['origin_onestop_id'] = previous_stop;
    params['destination_onestop_id'] = this_stop;
  }
  else {
    params['destination_onestop_id'] = next_stop;
    params['origin_onestop_id'] = this_stop;
  }
  $.extend(params,pagination,api_key);
  query = '/api/v1/schedule_stop_pairs.json?' + $.param(params);
  $.ajax({
    url: host + query,
    dataType: 'json',
    async: true,
    success: function(data) {
      var stop_distance;
      if (previous_stop) {
        stop_distance = data.schedule_stop_pairs[0].destination_dist_traveled;
      }
      else {
        stop_distance = data.schedule_stop_pairs[0].origin_dist_traveled;
      }
      getStop(this_stop, stop_distance);
    }
  });
}

function createLoadingColumn() {
  var div = _.el('div.fjs-col.leaf-col');
  var row = _.el('div.leaf-row');
  var text = _.text('Loading...');
  var i = _.el('span');

  _.addClass(i, ['fa', 'fa-refresh', 'fa-spin']);
  _.append(row, [i, text]);

  return _.append(div, row);
}
