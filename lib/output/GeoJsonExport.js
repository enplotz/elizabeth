var moment = require('moment');
var _ = require('underscore');

var fs = require('fs');
var request = require('request');

var DefaultPlugin = require(__dirname + '/../DefaultPlugin').Plugin;

function GeoJsonExport(options){
	this.help = {
		name: 'GeoJsonExport',
		description: '',
		options: {
			outputFile: 'File name format for output files, placeholders: %date%',
			addPlaces: 'Add places to json (default: true)',
			addMovements: 'Add movements to json (default: true)',
			dateFormat: 'Date format to use'
		}
	}

	this.options = _.extend({
		outputFile: '%date%.geojson',
		addPlaces: true,
		addMovements: true,
		dateFormat: 'YYYYMMDD'
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
						activity: activity,
						lat: point.lat,
						lon: point.lon
					});
				})
			});
		}
	});

	var features = [];
	if(this.options.addPlaces){
		places.forEach(function(place){
			features.push(
				{"type": "Feature",
					"geometry": {"type": "Point", "coordinates": [ place['lon'], place['lat'] ]},
					"properties": {"name": place.name}
				}
				)
		});
	}

	var pointsArr = [];
	points.forEach(function(point){
		pointsArr.push(
			[ point['lon'], point['lat'] ]
			)
	});
	features.push(
			{"type": "Feature",
				"geometry": {"type":"LineString",
				"coordinates": pointsArr },
				"properties": {"kind": "movements"}
			}
		);

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

}

exports.Plugin = GeoJsonExport;
