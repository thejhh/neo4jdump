#!/usr/bin/env node
var argv = require('optimist').argv;
var neo4j = require('neo4j');
var db = new neo4j.GraphDatabase(argv.host);
var q = require('q');
var errors = require('./errors.js');

/** Get all IDs */
function fetch_node_id_list() {
	var defer = q.defer();
	var query = [
		'START node=node(*)',
		'RETURN ID(node) AS id'
	].join('\n');
	var params = {};
	db.query(query, params, errors.catchfail(function (err, results) {
		if (err) {
			defer.reject(err);
			return;
		}
		
		var list = results.map(function (result) {
			return result.id;
		});
		
		defer.resolve(list);
	}));
	return defer.promise;
}

/** Get some nodes */
function fetch_nodes(list) {
	var defer = q.defer();
	if(list.length === 0) {
		console.error("Warning! No nodes in the database? Really?");
		defer.resolve([]);
		return defer.promise;
	}
	var query = [
		'START nodes=node(' + list.join(',') + ')',
		'RETURN nodes',
		'LIMIT ' + list.length
	].join('\n');
	//console.error('DEBUG: query = ' + query);
	var params = {};
	db.query(query, params, errors.catchfail(function (err, results) {
		if (err) {
			defer.reject(err);
			return;
		}
		//console.error('DEBUG: results = ' + JSON.stringify(results));
		var list = results.map(function (result) {
			return {'id':result.nodes.id, 'data':result.nodes.data};
		});
		//console.error('DEBUG: Got ' + list.length + ' items.');
		defer.resolve(list);
	}));
	return defer.promise;
}

/** Get all relation IDs */
function fetch_rel_id_list() {
	var defer = q.defer();
	var query = [
		'START r=relationship(*)',
		'RETURN ID(r) AS id'
	].join('\n');
	var params = {};
	db.query(query, params, errors.catchfail(function (err, results) {
		if (err) {
			defer.reject(err);
			return;
		}
		var list = results.map(function (result) {
			return result.id;
		});
		defer.resolve(list);
	}));
	return defer.promise;
}

/** Get some relations */
function fetch_rels(list) {
	var defer = q.defer();
	if(list.length === 0) {
		console.error("Warning! No relations in the database? Really?");
		defer.resolve([]);
		return defer.promise;
	}
	var query = [
		'START r=relationship(' + list.join(',') + ')',
		'MATCH a-[r]->b',
		'RETURN ID(r) AS id, TYPE(r) AS type, ID(a) AS from_id, ID(b) AS to_id, r AS rel',
		'LIMIT ' + list.length
	].join('\n');
	//console.error('DEBUG: query = ' + query);
	var params = {};
	db.query(query, params, errors.catchfail(function (err, results) {
		if (err) {
			defer.reject(err);
			return;
		}
		//console.error('DEBUG: results = ' + JSON.stringify(results));
		var list = results.map(function (result) {
			//console.error('DEBUG: result = ' + JSON.stringify(result));
			return {'id':result.id, 'type':result.type, 'start':result.from_id, 'end':result.to_id, 'data':result.rel.data};
		});
		//console.error('DEBUG: Got ' + list.length + ' items.');
		defer.resolve(list);
	}));
	return defer.promise;
}

/** Make sure JSON string has no new lines */
function format(str) {
	if(str.indexOf("\n") === -1) return str;
	console.error("DEBUG: Fixed some newlines in JSON!");
	return str.replace(/\n/gm, "\\n");
}
	
/* Handles next X nodes from the database */
function dump_nodes(id_list, patch_amount, tell_progress) {
	var defer = q.defer();
	var total_items = id_list.length;
	if(patch_amount < 1) {
		defer.reject(new TypeError("patch_amount illegal"));
		return defer.promise;
	}
	function do_nodes(){

		if(id_list.length === 0) {
			defer.resolve();
			return;
		}
	
		var i = 0,
	    max_len = id_list.length,
	    next_len = max_len < patch_amount ? max_len : patch_amount,
	    tmp = [];
		for(; i<next_len; ++i) {
			tmp.push(id_list.shift());
		}
		fetch_nodes(tmp).then(errors.catchfail(function(list) {
			//console.error('DEBUG: Got ' + list.length + ' items - ' + id_list.length + ' items left of ' + total_items + ' (' + (100-Math.round((id_list.length/total_items)*100)) +'% complete).');
			tell_progress((total_items-id_list.length)/total_items);
			list.map(function(item){
				console.log("N:" + item.id + ":" + format(JSON.stringify(item.data)) + ";");
			});
			
			do_nodes();
		}), function(err) {
			defer.reject(err);
		});
		
	} // do_next_nodes
		
	do_nodes();
	return defer.promise;
}
	
/* Handles next X relations from the database */
function dump_relations(id_list, patch_amount, tell_progress) {
	var defer = q.defer();
	var total_items = id_list.length;
	if(patch_amount < 1) {
		defer.reject(new TypeError("patch_amount illegal"));
		return defer.promise;
	}
	function do_rels(){

		if(id_list.length === 0) {
			defer.resolve();
			return;
		}

		var i = 0,
		    max_len = id_list.length,
		    next_len = max_len < patch_amount ? max_len : patch_amount,
		    tmp = [];
		for(; i<next_len; ++i) {
			tmp.push(id_list.shift());
		}
		fetch_rels(tmp).then(errors.catchfail(function(list) {
			//console.error('DEBUG: Got ' + list.length + ' items - ' + id_list.length + ' items left of ' + total_items + ' (' + (100-Math.round((id_list.length/total_items)*100)) +'% complete).');
			tell_progress((total_items-id_list.length)/total_items);
			list.map(function(item){
				console.log("R:" + item.id + ":" + format(item.type) + ":" + item.start + ":" + item.end + ":" + format(JSON.stringify(item.data)) + ";");
			});
			
			do_rels();
		}), function(err) {
			defer.reject(err);
		});
		
	} // do_next_rels
		
	do_rels();
	return defer.promise;
}
	
/* The Code */

var patch_size = parseInt(argv.size || 100, 10);

fetch_node_id_list().then(errors.catchfail(function(node_id_list) {

	var wheel = ['\\', '|', '/', '-'],
	    i = 0;
	process.stderr.write( 'Nodes: 0% (-)   ' );
	dump_nodes(node_id_list, patch_size, function(progress) {
		process.stderr.write( '\rNodes: ' + Math.round(progress*100) + '% (' + wheel[(i++)%4] + ')     ' );
	}).then(function() {
		process.stderr.write('\rNodes: 100%. ALL DONE.             \n');

		fetch_rel_id_list().then(errors.catchfail(function(rel_id_list) {
		
			i = 0;
			process.stderr.write( 'Relations: 0% (-)   ' );
			dump_relations(rel_id_list, patch_size, function(progress) {
				process.stderr.write( '\rRelations: ' + Math.round(progress*100) + '% (' + wheel[(i++)%4] + ')     ' );
			}).then(function() {
				process.stderr.write('\rRelations: 100%. ALL DONE.             \n');
			}, function(err) {
				errors.print(err);
			});
		
		}), function(err) {
			errors.print(err);
		});

	}, function(err) {
		errors.print(err);
	});
	

}), function(err) {
	errors.print(err);
});

/* EOF */
