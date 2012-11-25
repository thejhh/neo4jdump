
/** Error management */

var line_width = 78;
var line_buffer = new Array(line_width).join("-");

var default_error_type = Error;

var errors = module.exports = {};

/** Set default error type */
errors.setDefaultError = function(type) {
	if(type && (type instanceof Function)) {
		default_error_type = type;
	}
};

/** Pretty print error messages */
errors.print = function(info, err) {
	function format_line(text, buf) {
		var rows = buf.split("\n");
		return ""+text + rows.join('\n'+text);
	}
	var info = info || 'Error';
	var err_str = '' + err;
	var width = Math.floor((line_width - 4 - info.length) / 2);
	var title = '/' + line_buffer.substr(0, width) + ' ' + info + ' ' + line_buffer.substr(0, line_width - info.length - width - 4) + '\\';
	console.error('\n' + title);
	console.error(format_line("| ", err_str));
	['stack', 'arguments', 'type', 'message'].map(function(key) {
		if(!err[key]) return;
		if( (key === 'message') && err_str.match(err[key]) ) return;
		var w2 = Math.floor((line_width - 4 - key.length) / 2);
		console.error('+' + line_buffer.substr(0, w2) + ' ' + key + ' ' + line_buffer.substr(0, line_width - w2 - key.length - 4) + '+');
		var rows = err[key].split("\n");
		if(rows.length === 1) {
			console.error('| ' + err[key]);
			return;
		}
		if( (key === 'stack') && (rows[0] === err_str) ) {
			rows.shift();
		}
		console.error('| ' + rows.join('\n| ') );
	});
	console.error('\\' + line_buffer.substr(0, line_width - 2) + '/\n');
};

/* Failsave try-catch for errors */
errors.catchfail = function(opts, block) {
	var f, error_callback, error_type;
	if(opts && (opts instanceof Function) && (!block) ) {
		block = opts;
		opts = {};
	} else if(opts && (opts instanceof Function) && block && (block instanceof Function) ) {
		opts = {'errors':opts};
	}

	opts = opts || {};
	error_callback = opts.errors;
	if(! (error_callback && (error_callback instanceof Function)) ) {
		error_callback = function(err) {
			errors.print('Uncatched Exception', err);
		};
	}
	error_type = opts.type || default_error_type;
	f = function() {
		var self = this;
		var args = Array.prototype.slice.call(arguments);
		try {
			return block.apply(self, args);
		} catch(err) {
			errors.print('Exception', err);
			return error_callback(new error_type("Exception detected"));
		}
	}
	return f;
};

/* EOF */
