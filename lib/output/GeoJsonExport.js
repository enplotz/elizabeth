var moment = require('moment'),
	_ = require('underscore'),
	fs = require('fs'),
	request = require('request'),
	printlet = require('printlet');

var DefaultPlugin = require(__dirname + '/../DefaultPlugin').Plugin;

function GeoJsonExport(options){
	this.help = {
		name: 'GeoJsonExport',
		description: '',
		options: {
			outputFile: 'File name format for output files, placeholders: %date%',
			removePlaces: 'Don\'t add places to json (default: false)',
			removeMovements: 'Don\'t add movements to json (default: true)',
			image: 'write additional image file (default: false)',
			dateFormat: 'Date format to use',
			zoomLevel: 'the zoom level (0-18) for the map image (default: 14)',
			mapProvider: 'the map source to use: either osm or mapquest (default: mapquest)'
		}
	}

	this.options = _.extend({
		outputFile: '%date%.geojson',
		removePlaces: false,
		removeMovements: false,
		image: false,
		dateFormat: 'YYYYMMDD',
		zoomLevel: 14,
		mapProvider: 'mapquest'
	}, options);
}

GeoJsonExport.prototype = Object.create(DefaultPlugin.prototype)

GeoJsonExport.prototype.exportDay = function exportDay(day, cb){
	if(!day.segments){
		cb('Day ' + day.date + ' seems to have no segments')
		return;
	}

	var points = [];
	var places = [];

	day.segments.forEach(function(segment){
		var start = moment(segment.startTime, 'YYYYMMDDTHHmmssZ');
		var end = moment(segment.endTime, 'YYYYMMDDTHHmmssZ');

		if(segment.type == 'place') {
			places.push({
				name: segment.place.name,
				lat: segment.place.location.lat,
				lon: segment.place.location.lon,
			})
			return;
		}
		// Add movements if we got an activities segment
		if(segment.type == 'move' && Array.isArray(segment.activities)) {
			segment.activities.forEach(function(activity) {
				activity.trackPoints.forEach(function(point) {
					points.push({
						lat: point.lat,
						lon: point.lon
					});
				})
			});
		}
	});

	var features = [];
	if(!this.options.removePlaces){
		places.forEach(function(place){
			features.push(
				{"type": "Feature",
					"geometry": {"type": "Point", "coordinates": [ place['lon'], place['lat'] ]},
					"properties": {
						"name": place.name,
						"style": {
							"fillStyle": "rgb(200, 0, 0, 0.6)",
							"radius": 10
						}
					}
				}
				)
		});
	}
	if(!this.options.removeMovements){
		var pointsArr = [];
		points.forEach(function(point){
			pointsArr.push(
				// geojson expects longitude then latitude
				[ point['lon'], point['lat'] ]
				)
		});
		features.push(
				{"type": "Feature",
					"geometry": {"type":"LineString",
					"coordinates": pointsArr },
					"properties": {
						"kind": "movements",
						"style": {
							"lineWidth":"6",
							"strokeStyle":"rgba(0,0,200,0.5)"
						}
					}
				}
			);
	}

	var geojsonObject = {"type": "FeatureCollection",
			"features": features,
			"properties": { "date": day.date}
		};

	fs.writeFile(this.getFilename(day.date), JSON.stringify(geojsonObject), function(err){
		if(err){
			cb(err);
			return;
		}
		cb(null, day.date);
	});

	var zoomLevel = this.options.zoomLevel;
	if(this.options.image){
		// use places and move points for midpoint calculation
		var all = points.concat(places);
		var midPoint = midLocation(boundingBox(all));
		// TODO calculate zoom level based on extreme points

		var filename = this.getFilename(day.date);
		var tileJson = require('./geo/'+this.options.mapProvider+'.json');

		printlet(tileJson)({
			width: 800,
			height: 600,
			zoom: zoomLevel,
			lat: midPoint['lat'],
			lng: midPoint['lon'],
			format: 'png',
			geojson: geojsonObject
			}, function(err, stream) {
			var ws;
			if (err != null) throw new Error(err);
			ws = fs.createWriteStream(filename + ".png");
			stream.pipe(ws);
		});
	}
}

// calculate the bounding box of the given points
function boundingBox(locations){
	var lat = { "min": Number.MAX_VALUE, "max":0 };
	var lon = { "min": Number.MAX_VALUE, "max":0 };
	locations.forEach(function(location){
		lat['min'] = Math.min(lat['min'], location['lat']); // min latitude
		lat['max'] = Math.max(lat['max'], location['lat']); // max latitude
		lon['min'] = Math.min(lon['min'], location['lon']); // min longitude
		lon['max'] = Math.max(lon['max'], location['lon']); // max longitude
	});
	return [ [ lat['min'], lon['min'] ], [ lat['max'], lon['max'] ] ];
}

// calculate the mid point of the bounding box
function midLocation(bbox){
	// bbox [ [minLat,minLon] , [maxLat,maxLon] ]
	var midLat = (bbox[1][0] - bbox[0][0]) / 2 + bbox[0][0];
	var midLon = (bbox[1][1] - bbox[0][1]) / 2 + bbox[0][1];
	return { "lat":midLat, "lon":midLon };
}

exports.Plugin = GeoJsonExport;
