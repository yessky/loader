/*
 * KJS - A Light And Easy-To-Use Module Loader
 * Copyright (C) 2013 aaron.xiao
 * Author: aaron.xiao <admin@veryos.com>
 * Version: @version@
 * License: http://dev.veryos.com/MIT-LICENSE
 */

(function( global, undefined ) {

	var version = '@version@',

		empty = {},
		push = [].push,
		toString = {}.toString,
		strundef = typeof undefined,
		isOpera = typeof opera !== strundef && opera.toString() === '[object Opera]',

		interactived = false,
		currentlyAddingScript,
		interactiveScript,

		rvars = /\{\{([^\{]+)\}\}/g,
		rcomplete = navigator.platform === 'PLAYSTATION 3' ?
			/^complete$/ : /^(complete|loaded)$/,
		rnoise = /\\\/|\\\/\*|\[.*?(\/|\\\/|\/\*)+.*?\]/g,
		rdeps = /"(?:\\"|[^"])*"|'(?:\\'|[^'])*'|\/\*[\S\s]*?\*\/|\/(?:\\\/|[^\/\r\n])+\/(?=[^\/])|\/\/.*|\.\s*require|(?:^|[^$])\brequire\s*\(\s*(["'])(.+?)\1\s*\)/g,

		incomingQueue = [],
		pendingQueue = [],

		resolved = {},
		registry = {},
		defined = {},

		LOADING = 1,
		LOADED = 2,
		READY = 3,
		ERROR = 4,

		vars = {},
		rules = [],
		connects = {},

		cwp = location.protocol,
		cwd = dir( location.pathname ),
		prefix = host( location.href ),
		splitIndex = prefix.length,

		baseElement, head, hasAttchEvent,
		signal, kjsnode, kjsdir, appMain, scripts;

	// Helpers
	function isFunction( it ) {
		return toString.call( it ) == '[object Function]';
	}

	function isArray( it ) {
		return toString.call( it ) == '[object Array]';
	}

	function mixin( dest, source ) {
		var name, value;
		for ( name in source ) {
			value = source[name];
			if ( !(name in dest) || (dest[name] !== value &&
				(!(name in empty) || empty[name] !== value)) ) {
				dest[name] = value;
			}
		}
		return dest;
	}

	// Path utils

	function normalizeArray( parts, allowAboveRoot ) {
		// if the path tries to go above the root, `up` ends up > 0
		var up = 0, last;
		for ( var i = parts.length - 1; i >= 0; i-- ) {
			last = parts[i];
			if ( last === '.' ) {
				parts.splice(i, 1);
			} else if ( last === '..' ) {
				parts.splice( i, 1 );
				up++;
			} else if ( up ) {
				parts.splice( i, 1 );
				up--;
			}
		}

		// if the path is allowed to go above the root, restore leading ..s
		if ( allowAboveRoot ) {
			for ( ; up--; up ) {
				parts.unshift( '..' );
			}
		}

		return parts;
	}

	function normalize( path ) {
		var isAbsolute = path.charAt(0) === '/',
			trailingSlash = path.substr(-1) === '/',
			parts = path.split('/'), ret = [], part;

		for ( var i = 0, l = parts.length; i < l; i++ ) {
			part = parts[i];
			if ( !!part ) {
				ret.push( part );
			}
		}

		// Normalize the path
		path = normalizeArray( ret, !isAbsolute ).join('/');

		if ( !path && !isAbsolute ) {
			path = '.';
		}
		if ( path && trailingSlash ) {
			path += '/';
		}

		return (isAbsolute ? '/' : '') + path;
	}

	function dir( uri ) {
		var m = uri.match( /.*(?=\/.*$)/ );
		return ( m ? m[0] : '.' ) + '/';
	}

	function host( uri ) {
		var m = uri.match( /^(\w+:\/\/[^\/]*)\/?.*$/ );
		return m && m[1] ? m[1] : '';
	}

	function filename( id ) {
		id = id.indexOf(':/') === -1 ? prefix + id : id;
		return (id.slice(-3) === '.js' || id.indexOf('?') > -1 || id.slice(-1) === '/') ? id : id + '.js';
	}

	function resolve( path, rel, normalized ) {
		var part, parts;

		if ( path in resolved ) {
			return path;
		}

		// Replace registered varaibles '{{var}}'
		if ( path.indexOf('{{') > -1 ) {
			path = path.replace(rvars, function( a, b ) {
				return vars[b];
			});
		}

		if ( path.indexOf('//') === 0 ) {
			path = cwp + path;
			if ( path.indexOf(prefix) === 0 ) {
				path = path.substring( splitIndex );
			}
		} else if ( path.indexOf(':/') > -1 ) {
			if ( path.indexOf(prefix) === 0 ) {
				path = path.substring( splitIndex );
			}
		} else {
			part = path.charAt(0);

			if ( part === '/' ) {
				path = normalized ? path : normalize( path );
			} else {
				if ( normalized ) {
					path = rel ? normalize( rel + path ) : path;
				} else {
					path = normalize( (rel || cwd) + path );
				}
			}
		}

		// Apply map rules
		path = rules.length ? mapped( path ) : path;
		resolved[path] = 1;

		return path;
	}

	function mapped( path ) {
		var i = -1, val = path, rule;

		while ( (rule = rules[++i]) ) {
			path = isFunction(rule) ?
				( rule(val) || val ) : val.replace( rule[0], rule[1] );

			if ( path !== val ) {
				break;
			}
		}

		return path;
	}

	function makeModuleMap( id, rel, normalized ) {
		var mid, pid, i;

		if ( (i = id.indexOf('!')) > 0 ) {
			mid = resolve( id.substr(i + 1), rel, normalized );
			pid = resolve( id.substr(0, i), rel, normalized );
		} else {
			mid = resolve( id, rel, normalized );
		}

		return {
			id: pid ? pid + '!' + mid : mid,
			mid: mid,
			pid: pid
		};
	}

	head = document.getElementsByTagName('head')[0];
	hasAttchEvent = head.attachEvent && !(head.attachEvent.toString &&
		head.attachEvent.toString().indexOf('[native code]') === -1);
    baseElement = document.getElementsByTagName('base')[0];
    head = baseElement ? baseElement.parentNode : head;

	function getInteractiveScript() {
		if ( interactiveScript && interactiveScript.readyState === 'interactive' ) {
			return interactiveScript;
		}

		var i = -1, script;

		scripts = head.getElementsByTagName('script');

		while ( (script = scripts[++i]) ) {
			if ( script.readyState === 'interactive' ) {
				return (interactiveScript = script);
			}
		}

		return interactiveScript;
	}

	function loadScript( map ) {
		var node = document.createElement('script');

		node.type = 'text/javascript';
		node.charset = 'utf-8';
		node.async = true;
		node.setAttribute( 'data-module', map.id );

		if ( hasAttchEvent && !isOpera ) {
			interactived = true;
			node.attachEvent( 'onreadystatechange', onScriptLoad );
		} else {
			node.addEventListener( 'load', onScriptLoad, false );
			node.addEventListener( 'error', onScriptError, false );
		}

		node.src = filename( map.mid );
		currentlyAddingScript = node;
		if ( baseElement ) {
			head.insertBefore( node, baseElement );
		} else {
			head.appendChild( node );
		}
		currentlyAddingScript = null;

		return node;
	}

	function onScriptLoad( e ) {
		var node = e.currentTarget || e.srcElement;

		if ( e.type === 'load' || (node && rcomplete.test(node.readyState)) ) {
			interactiveScript = null;
			KM.onload( node.getAttribute('data-module') );
			removeListener( node );
		}
	}

	function onScriptError( e ) {
		var node = e.currentTarget || e.srcElement,
			info = {
				id: node.getAttribute('data-module'),
				message: 'Script error'
			};

		removeListener( node );

		signal( 'error', info )
		return onError( info );
	}

	function removeListener( node ) {
		if ( node.detachEvent && !isOpera ) {
			node.detachEvent( 'onreadystatechange', onScriptLoad );
		} else {
			node.removeEventListener( 'load', onScriptLoad, false );
			node.removeEventListener( 'error', onScriptError, false );
		}

		node.parentNode.removeChild( node );
	}

	function onError( data ) {
		throw data;
	}

	function syncRequire( rel ) {
		rel = dir( rel );

		function req( id ) {
			return defined[ makeModuleMap( id, rel, true ).id ];
		}

		req.toUrl = function( id ) {
			id = makeModuleMap( id, rel, true ).id;
			return normalize( id );
		};

		req.resolve = function( id, ref ) {
			return makeModuleMap( id, rel, true ).id;
		};

		return req;
	}

	function KM( map ) {
		this.id = map.id;
		this.map = map;
		this.dependencies = [];
		this.status = 0;
		this._chain = {};
		this._users = [];
		this._events = {};
	}

	KM.prototype = {
		on: function( name, handler ) {
			var handlers = this._events[name] || (this._events[name] = []);
			handlers.push( handler );
		},

		signal: function( name, e ) {
			var handlers = this._events[name];

			if ( handlers ) {
				while ( handlers.length ) {
					handlers.shift().call( this, e );
				}
				delete this._events[name];
			}
		},

		init: function( deps, factory, check ) {
			if ( this.status > LOADING ) {
				return;
			}

			this.status = LOADED;

			if ( deps ) {
				var rel = dir( this.map.mid ),
					dependencies = this.dependencies,
					hash = {}, i = -1, mid;

				while ( (mid = deps[++i]) ) {
					if ( !hash[mid] ) {
						hash[mid] = true;
						dependencies.push( makeModuleMap(mid, rel, true) );
					}
				}
			}

			this.factory = factory;
			this._remain = this.dependencies.length;
			signal( 'save', this.id );

			if ( check ) {
				if ( this._remain === 0 ) {
					return this.declare();
				}
				this.check();
			}
		},

		load: function() {
			var map = this.map,
				id = map.id,
				rid = map.mid,
				pid = map.pid,
				status, plugin, info;

			this.status = LOADING;
			signal( 'load', this.id );

			if ( pid ) {
				if ( (plugin = defined[pid]) ) {
					if ( plugin.load ) {
						plugin.load(rid, function( factory ) {
							KM.save( map, {factory: factory}, true );
						});
					} else {
						info = {
							id: pid,
							message: 'Plugin "' + pid + '" did not implement "load" method'
						};
						signal( 'error', info );
						return onError( info );
					}
				} else {
					plugin = KM.get( makeModuleMap(pid, null, true) );
					status = plugin.status;

					plugin.on('ready', function() {
						if ( (plugin = defined[pid]) ) {
							if ( plugin.load ) {
								plugin.load(rid, function( factory ) {
									KM.save( map, {factory: factory}, true );
								});
							} else {
								info = {
									id: pid,
									message: 'Plugin "' + pid + '" did not implement "load" method'
								};
								signal( 'error', info );
								return onError( info );
							}
						}
					});

					if ( status < LOADING ) {
						plugin.load();
					} else if ( status === LOADED ) {
						plugin.check();
					}
				}
			} else {
				loadScript( map );
			}
		},

		// Check if dependencies are ready
		check: function() {
			var id = this.id,
				deps = this.dependencies,
				chain = this._chain,
				status = this.status,
				unready = [],
				i = -1,
				remain = 0,
				map, mod, did, dchain;

			if ( status !== LOADED ) {
				if ( status < LOADING ) {
					this.load();
				}

				return;
			}

			while ( (map = deps[++i]) ) {
				did = map.id;

				if ( did in defined ) {
					this._remain--;
				} else {
					mod = KM.get( map );
					status = mod.status;

					if ( status < READY ) {
						mod._users[id] = (mod._users[id] || 0) + 1;

						if ( status === LOADED ) {
							if ( did in chain ) {
								this._remain--;
								signal( 'circular', [id, did] );
							} else {
								mod._chain[id] = true;
								mixin( mod._chain, chain );
								mod.check();
							}
						} else if ( status < LOADING ) {
							mod.load();
						}
					}
				}
			}

			if ( this._remain === 0 ) {
				return this.declare();
			}
		},

		declare: function() {
			var id = this.id,
				users = this._users,
				factory = this.factory,
				exports = this.exports,
				returned, name, info;

			if ( isFunction(factory) ) {
				try {
					returned = this.exports = {};
					exports = factory( syncRequire(id), this.exports, this );

					// Set exports via 'exports.attr=sth'
					if ( returned === this.exports ) {
						for ( name in returned ) {
							if ( returned.hasOwnProperty(name) ) {
								exports = returned;
								break;
							}
						}
					}
					// Set exports via 'module.exports=sth'
					else if ( typeof this.exports !== strundef ) {
						exports = this.exports;
					}
				} catch( e ) {
					info = {
						id: id,
						message: e.message
					};
					this.status = ERROR;
					this.postEnd();
					signal( 'error', info );
					return onError( info );
				}
			} else {
				exports = factory;
			}

			// Signal it's ready to use
			this.status = READY;
			this.exports = defined[id] = exports;
			this.postEnd();
			signal( 'ready', id );
		},

		postEnd: function() {
			var users = this._users, mid, mod;

			this.signal( 'ready', this.id );

			for ( mid in users ) {
				if ( users.hasOwnProperty(mid) ) {
					mod = registry[mid];
					mod._remain -= users[mid];
					if ( mod._remain === 0 ) {
						mod.declare();
					}
				}
			}

			delete this._chain;
			delete this._users;
			delete this._remain;
			delete this.factory;
			delete registry[this.id];
		}
	};

	// Fetch multiple modules
	KM.fetch = function( uris, onComplete ) {
		var i = -1,
			remain = uris.length,
			map, mod, status;

		while ( (map = uris[++i]) ) {
			if ( !(map.id in defined) ) {
				KM.get( map ).on( 'ready', onExecute );
			} else {
				remain--;
			}
		}

		if ( remain === 0 ) {
			return onComplete();
		}

		i = -1;

		while ( (map = uris[++i]) ) {
			if ( !(map.id in defined) ) {
				registry[map.id].check();
			}
		}

		function onExecute() {
			if ( --remain === 0 ) {
				onComplete();
			}
		}
	};

	// A script was loaded
	KM.onload = function( id ) {
		var meta, mod;

		if ( (meta = pendingQueue.shift()) ) {
			pendingQueue = [];
			KM.save( makeModuleMap(id, null, true), meta, true );
		}

		// Not a cmd module
		if ( !(id in defined) && (mod = registry[id]) && mod.status < LOADED ) {
			signal( 'error', mod.map.mid );
			return onError({
				id: mod.map.mid,
				message: 'No define call'
			});
		}
	};

	KM.get = function( map ) {
		var id = map.id;

		if ( registry[id] ) {
			return registry[id];
		} else {
			return ( registry[id] = new KM(map) );
		}
	};

	KM.save = function( map, meta, check ) {
		// Do not touch a defined module
		if ( !(map.id in defined) ) {
			KM.get( map ).init( meta.deps, meta.factory, check );
		}
	};

	function define( id, deps, factory ) {
		var meta, script, map;

		if ( typeof id !== 'string' ) {
			factory = deps;
			deps = id;
			id = undefined;
		}

		if ( !isArray(deps) ) {
			factory = deps;
			deps = [];
		}

		if ( isFunction(factory) && factory.length ) {
			factory.toString().replace( rnoise, '' )
			.replace(rdeps, function( a, b, c ) {
				if ( c ) {
					deps.push( c );
				}
			});
		}

		if ( !id && interactived ) {
			script = currentlyAddingScript || getInteractiveScript();
			if ( script && (id = script.getAttribute('data-module')) ) {
				map = makeModuleMap( id, null, true );
			}
		} else if ( id ) {
			map = makeModuleMap( id, null, true );
		}

		meta = {
			deps: deps,
			factory: factory
		};

		map ? KM.save( map, meta ) : pendingQueue.push( meta );
	}

	define.cmd = define.amd = {
		vendor: 'kjs'
	};

	function require( deps, callback ) {
		pendingQueue = [];
		deps = isArray(deps) ? deps : [deps];

		var i = deps.length;
		while ( i-- ) {
			deps[i] = makeModuleMap( deps[i] );
		}

		return KM.fetch(deps, function() {
			if ( callback ) {
				var args = [], i = -1, dep;

				while ( (dep = deps[++i]) ) {
					args[i] = defined[dep.id];
				}

				callback.apply( global, args );
			}
		});
	}

	require.version = version;

	require.config = function( data ) {
		var name, cfg, set, opt;

		for ( name in data ) {
			set = data[name];

			switch ( name ) {
				case 'vars':
					for ( opt in set ) {
						vars[opt] = set[opt];
					}
					break;
				case 'map':
					rules = rules.concat( set );
			}
		}
	};

	require.resolve = function( id, rel ) {
		return makeModuleMap( id, rel ).id;
	};

	require.toUrl = function( id, rel ) {
		return filename( makeModuleMap(id, rel).mid );
	};

	require.on = function ( cid, handler ) {
		var handlers = connects[cid] || (connects[cid] = []);

		handler.sid = handlers.push( handler ) - 1;

		return {
			remove: function() {
				connects[cid].splice( handler.sid, 1 );
			}
		};
	};

	require.signal = signal = function( cid, args ) {
		var handlers = connects[cid], handler;

		if ( handlers ) {
			handlers = handlers.slice(0);
			while( (handler = handlers.shift()) ) {
				handler( args );
			}
		}
	};

	// EXPOSE API
	global.define = define;
	global.require = global.kjs = require;

	// Handle data-main

	kjsnode = document.getElementById('kjsnode');
	if ( !kjsnode ) {
		scripts = document.getElementsByTagName('script');
		kjsnode = scripts[ scripts.length - 1 ];
	}

	appMain = kjsnode.getAttribute('data-main');
	if ( appMain ) {
		appMain = appMain.split( /\s*,\s*/ );
		push.apply( incomingQueue, appMain );
	}

	setTimeout(function() {
		if ( incomingQueue.length ) {
			require( incomingQueue );
			incomingQueue = [];
		}
	}, 0);
})( this );