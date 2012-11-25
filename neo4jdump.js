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
		console.error('DEBUG: Got ' + list.length + ' items.');
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
		console.error('DEBUG: Got ' + list.length + ' items.');
		defer.resolve(list);
	}));
	return defer.promise;
}

/* The Code */

fetch_rel_id_list().then(errors.catchfail(function(id_list) {

	/** Make sure JSON string has no new lines */
	function format(str) {
		if(str.indexOf("\n") === -1) return str;
		console.error("DEBUG: Fixed some newlines in JSON!");
		return str.replace(/\n/gm, "\\n");
	}
	
	var total_items = id_list.length;
	
	/* Handles next X nodes from the database */
	function dump_nodes(patch_amount) {
		var defer = q.defer();
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
				console.error('DEBUG: Got ' + list.length + ' items - ' + id_list.length + ' items left of ' + total_items + ' (' + Math.round((id_list.length/total_items)*100) +'%).');
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
	function dump_relations(patch_amount) {
		var defer = q.defer();
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
				console.error('DEBUG: Got ' + list.length + ' items - ' + id_list.length + ' items left of ' + total_items + ' (' + Math.round((id_list.length/total_items)*100) +'%).');
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
	
	dump_relations(500).then(function() {
		console.error('ALL DONE.');
	}, function(err) {
		errors.print(err);
	});

}), function(err) {
	errors.print(err);
});

/* EOF */
