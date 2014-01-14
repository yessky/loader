/*
 * kjs - A Light And Easy-To-Use Module Loader
 * Copyright (C) 2013 aaron.xiao
 * Author: aaron.xiao <admin@veryos.com>
 * Version: @version@
 * License: http://dev.veryos.com/MIT-LICENSE
 */

(function( global, undefined ) {
	'use strict';

	var version = '@version@',

		toString = {}.toString,
		strundef = typeof undefined,
		isOpera = typeof opera !== strundef && opera.toString() === '[object Opera]',

		rprotocol = /^[\w\+\.\-]+:\//,
		rcomplete = navigator.platform === 'PLAYSTATION 3' ?
			/^complete$/ : /^(complete|loaded)$/,
		rdeps = /"(?:\\"|[^"])*"|'(?:\\'|[^'])*'|\/\*[\S\s]*?\*\/|\/(?:\\\/|[^\/\r\n])+\/(?=[^\/])|\/\/.*|\.\s*require|(?:^|[^$])\brequire\s*\(\s*(["'])(.+?)\1\s*\)/g,

		interactived = false,
		currentlyAddingScript,
		interactiveScript,

		pending = [],
		registry = {},
		activing = {},
		defined = {},
		resolved = {},
		fetched = {},
		memoried = {},

		config = {
			paths: {},
			shim: {},
			base: './',
			timeout: 0
		},
		connects = {},

		uid = 1,
		protocol = location.protocol,
		prefix = protocol + '//' + location.host,
		cwd = dir( location.pathname ),
		pos = prefix.length,
		absBase = cwd,

		slice = Array.prototype.slice,
		hasTimeout = typeof setTimeout !== strundef,

		checking, nextTick, baseElement, head, hasAttch, signal;

	// Helpers
	function isFunction( it ) {
		return toString.call( it ) == '[object Function]';
	}

	function isArray( it ) {
		return toString.call( it ) == '[object Array]';
	}

	function mixin( dest, source ) {
		for ( var name in source ) {
			dest[name] = source[name];
		}
		return dest;
	}

	function getProp( dest, name ) {
		if ( dest.hasOwnProperty(name) ) {
			return dest[name];
		}
	}

	function hitch( context, fn, data ) {
		return function() {
			var args = arguments;
			if ( data ) {
				args = slice.call( args ).concat( data );
			}
			return fn.apply( context, args );
		};
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

	function trimArray( parts ) {
		var start = 0, len = parts.length;
		for ( ; start < len; start++ ) {
			if ( parts[start] !== '' ) break;
		}

		var end = len - 1;
		for ( ; end >= 0; end-- ) {
			if ( parts[end] !== '' ) break;
		}

		if ( start > end ) return [];
		return parts.slice( start, end + 1 );
	}

	function normalize( path ) {
		var isAbsolute = path.charAt(0) === '/',
			trailingSlash = path.slice(-1) === '/',
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

	function relative( from, to ) {
		to = normalize( to );

		var fromParts = trimArray( from.split('/') );
		var toParts = trimArray( to.split('/') );

		var length = Math.min( fromParts.length, toParts.length );
		var samePartsLength = length;
		for ( var i = 0; i < length; i++ ) {
			if ( fromParts[i] !== toParts[i] ) {
				samePartsLength = i;
				break;
			}
		}

		var outputParts = [];
		for ( var i = samePartsLength; i < fromParts.length; i++ ) {
			outputParts.push( '..' );
		}

		outputParts = outputParts.concat( toParts.slice(samePartsLength) );

		return outputParts.join('/');
	}

	function relativeBase( path ) {
		var i = path.lastIndexOf('/') + 1,
			name = '';

		if ( i > -1 ) {
			name = path.substring(i);
			path = path.substring(0, i);
		}

		path = relative( absBase, path );

		return (path ? path + '/' : path) + name;
	}

	function dir( path ) {
		var parts = path.split('/');
		parts.pop();
		return (parts.length ? parts.join('/') : '.') + '/';
	}

	function filename( name, skipExt ) {
		var parts = name.split('/'),
			paths = config.paths,
			i = parts.length,
			part, val;

		// Replace registered path
		if ( paths ) {
			for ( ; i > 0; i-- ) {
				part = parts.slice(0, i).join('/');
				if ( (val = getProp(paths, part)) ) {
					if ( isArray(val) ) {
						val = val[0];
					}
					parts.splice( 0, i, val );
					break;
				}
			}
			name = parts.join('/');
		}

		// Add base for relative path
		if ( !rprotocol.test(name) ) {
			name = config.base + name;
		}

		// Add extension
		name = (skipExt || name.slice(-3) === '.js' || name.indexOf('?') > -1 || name.slice(-1) === '/') ? name : name + '.js';

		return name;
	}

	function resolve( name, baseName ) {
		var maps, i, parts, part, val, isRelative;

		if ( name.indexOf('//') === 0 ) {
			name = protocol + name;
			if ( name.indexOf(prefix) === 0 ) {
				name = relativeBase( name.substring(pos) );
				isRelative = true;
			}
		} else if ( name.indexOf('://') > -1 ) {
			if ( name.indexOf(prefix) === 0 ) {
				name = relativeBase( name.substring(pos) );
				isRelative = true;
			}
		} else {
			part = name.charAt(0);
			isRelative = true;

			if ( part === '/' ) {
				name = relativeBase( name );
			} else if ( part === '.' ) {
				if ( baseName ) {
					name = normalize( baseName + name );
				} else if ( name.indexOf('./') === 0 ) {
					name = name.substring(2);
				}
			}
		}

		// Apply map rules
		if ( isRelative && maps ) {
			maps = config.map;
			parts = name.split('/');
			for ( i =  parts.length; i > 0; i-- ) {
				part = parts.slice(0, i).join('/');
				if ( (val = getProp(maps, part)) ) {
					parts.splice( 0, i, val );
					break;
				}
			}
			name = parts.join('/');
		}

		return name;
	}

	function makeModuleMap( id, rel, fixed ) {
		var inner = false,
			map, moduleName, pluginName, i, name;

		if ( !id ) {
			id = '_m>*>@_' + uid++;
			inner = true;
		}

		if ( resolved.hasOwnProperty(id) ) {
			return resolved[id];
		}

		if ( (i = id.indexOf('!')) > 0 ) {
			moduleName = id.substring( i + 1 );
			pluginName = id.substring( 0, i );
			if ( !fixed ) {
				moduleName = resolve( moduleName, rel );
				pluginName = resolve( pluginName, rel );
			}
			id = pluginName + '!' + moduleName;
		} else {
			id = moduleName = fixed ? id : resolve( id, rel );
		}

		if ( resolved.hasOwnProperty(id) ) {
			return resolved[id];
		}

		name = filename( moduleName, !!pluginName );
		i = moduleName.lastIndexOf('/') + 1;

		map = resolved[id] = {
			id: id,
			inner: inner,
			moduleName: moduleName,
			pluginName: pluginName,
			parentName: moduleName.substring( 0, i ),
			filename: name
		};

		return map;
	}

	head = document.getElementsByTagName('head')[0];
	hasAttch = head.attachEvent && !(head.attachEvent.toString &&
		head.attachEvent.toString().indexOf('[native code]') === -1);
    baseElement = document.getElementsByTagName('base')[0];
    head = baseElement ? baseElement.parentNode : head;

    nextTick = hasTimeout ? function(fn) {
        setTimeout( fn, 4 );
    } : function(fn) { fn(); };

	function getInteractiveScript() {
		if ( interactiveScript && interactiveScript.readyState === 'interactive' ) {
			return interactiveScript;
		}

		var scripts = head.getElementsByTagName('script'),
			i = -1, script;

		while ( (script = scripts[++i]) ) {
			if ( script.readyState === 'interactive' ) {
				return (interactiveScript = script);
			}
		}

		return interactiveScript;
	}

	function loadScript( map ) {
		if ( fetched[map.filename] ) {
			return;
		}

		fetched[map.filename] = true;

		var node = document.createElement('script'),
			timeout = config.timeout, tid;

		node.type = 'text/javascript';
		node.charset = 'utf-8';
		node.async = true;
		node.setAttribute( 'data-module', map.id );

		if ( hasTimeout && timeout ) {
			tid = setTimeout(function() {
				onScriptTimeout( map, node );
			}, timeout);
			node.setAttribute( 'data-timer', tid );
		}

		if ( hasAttch && !isOpera ) {
			interactived = true;
			node.attachEvent( 'onreadystatechange', onScriptLoad );
		} else {
			node.addEventListener( 'load', onScriptLoad, false );
			node.addEventListener( 'error', onScriptError, false );
		}

		node.src = map.filename;
		signal( 'loading', map.id );
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
			removeListener( node );
			metaLoad( makeModuleMap(node.getAttribute('data-module'), null, true) );
		}
	}

	function onScriptError( e ) {
		var node = e.currentTarget || e.srcElement,
			id = node.getAttribute('data-module');

		removeListener( node );
		if ( !fallback(id) ) {
			return onError({
				id: id,
				message: 'Script error'
			});
		}
	}

	function onScriptTimeout( map, node ) {
		node && removeListener( node );
		if ( !fallback(map.id) ) {
			return onError({
				id: map.id,
				message: 'Load timeout'
			});
		}
	}

	function removeListener( node ) {
		var tid = node.getAttribute('data-timer');

		tid && clearTimeout( +tid );

		if ( node.detachEvent && !isOpera ) {
			node.detachEvent( 'onreadystatechange', onScriptLoad );
		} else {
			node.removeEventListener( 'load', onScriptLoad, false );
			node.removeEventListener( 'error', onScriptError, false );
		}

		node.parentNode && node.parentNode.removeChild( node );
	}

	function onError( info ) {
		var id = info.id,
			mod = getProp( registry, id ),
			done, msg;

		if ( mod ) {
			mod.error = info;
			if ( mod.events.error ) {
				done = true;
				mod.signal( 'error', info );
			}
		}

		signal( 'error', info );

		if ( !done ) {
			msg = '\n>>> modules: ' + id + '\n' +
			'>>> message: ' + info.message;
			throw new Error( msg );
		}
	}

	function runMain() {
		var kjsnode = document.getElementById('kjsnode'),
			scripts, appMain;

		if ( !kjsnode ) {
			scripts = document.getElementsByTagName('script');
			kjsnode = scripts[ scripts.length - 1 ];
		}

		if ( (appMain = kjsnode.getAttribute('data-main')) ) {
			require( [appMain] );
		}
	}

	function syncRequire( rel ) {
		function req( id ) {
			return defined[ makeModuleMap(id, rel).id ];
		}

		req.toUrl = function( id ) {
			return makeModuleMap(id, rel).filename;
		};

		req.resolve = function( id, ref ) {
			return makeModuleMap( id, rel ).id;
		};

		return req;
	}

	function KM( map ) {
		this.map = map;
		this.deps = [];
		this.defined = [];
		this.isDef = [];
		this.remain = 0;
		this.events = getProp(memoried, map.id) || {};
		this.shim = getProp(config.shim, map.id);
	}

	KM.prototype = {
		on: function( name, handler ) {
			var handlers = this.events[name] || (this.events[name] = []);
			handlers.push( handler );
		},

		signal: function( name, e ) {
			var handlers = this.events[name],
				i = -1, handler;

			if ( handlers ) {
				while ( (handler = handlers[++i]) ) {
					handler( e );
				}
				if ( name === 'error' ) {
					delete this.events[name];
				}
			}
		},

		init: function( deps, factory, onError, options ) {
			if ( this._inited ) {
				return;
			}

			options = options || {};
			this.factory = factory;

			if ( onError ) {
				this.on( 'error', onError );
			}

			this.deps = deps && deps.slice(0) || [];
			this.onError = onError;

			this._inited = true;

			if ( options.setup || this._setup ) {
				this.setup();
			} else {
				this.lookup();
			}
		},

		setup: function() {
			activing[this.map.id] = this;
			this._setup = true;

			this._setuping = true;

			var map = this.map,
				deps = this.deps,
				rel = !map.inner && map.parentName,
				errback = this.onError, mid, mod;

			for ( var i = 0, c = deps.length; i < c; i++ ) {
				if ( typeof (map = deps[i]) === 'string' ) {
					map = deps[i] = makeModuleMap( deps[i], rel );
					mid = map.id;
					mod = getProp( registry, mid );
					this.remain += 1;

					if ( defined.hasOwnProperty(mid) &&
						(!mod || mod._signalComplete) ) {
						this.done( i , defined[mid] );
					} else {
						mod = getModule( map );
						if ( mod.error && errback ) {
							errback( mod.error );
						} else {
							mod.on('defined', hitch(this, function( api, i ) {
								this.done( i , api );
								this.lookup();
							}, [i]));
							if ( errback ) {
								mod.on('error', function( err ) {
									errback( err );
								});
							}
						}
					}
				}

				if ( (mod = getProp( registry, mid )) && !mod._setup ) {
					mod.setup();
				}
			}

			this._setuping = false;

			this.lookup();
		},

		lookup: function() {
			// No need to lookup inactive module
			if ( !this._setup || this._setuping ) {
				return;
			}

			// Module meta not loaded, try to load it
			if ( !this._inited ) {
				this.fetch();
			}
			// Factory executed, eeror occures
			else if ( this.error ) {
				this.signal( 'error', this.error );
			}
			// Lookup its dependencies
			else if ( !this._defining ) {
				this._defining = true;

				if ( this.remain === 0 && !this._defined ) {
					var map = this.map,
						id = map.id,
						inner = map.inner,
						factory = this.factory,
						args = this.defined,
						mod = {
							id: id,
							filename: filename
						},
						exports, ret, err, name, modified;

					if ( isFunction(factory) ) {
						if ( inner ) {
							exports = factory.apply( global, args );
						} else {
							exports = mod.exports = {};

							try {
								ret = factory.call( global, syncRequire(map.parentName), exports, mod );
							} catch (e) {
								err = {
									id: id,
									message: e.message
								};
							}

							if ( typeof ret !== strundef ) {
								for ( name in exports ) {
									if ( exports.hasOwnProperty(name) ) {
										modified = true;
										break;
									}
								}

								if ( !modified ) {
									exports = exports === mod.exports ? ret : module.exports;
								}
							}
						}

						if ( err ) {
							this.error = err;
							return onError( err );
						}
					} else {
						exports = factory;
					}

					this.exports = mod.exports = exports;

					if ( !inner ) {
						defined[id] = exports;
					}

					delete registry[id];
					delete activing[id];

					this._defined = true;
				}

				this._defining = false;

				if ( this._defined && !this._signal ) {
					this._signal = true;
					this.signal( 'defined', this.exports );
					this._signalComplete = true;
					signal( 'defined', id );
				}
			}
		},

		done: function( i, api ) {
			if ( !this.isDef[i] ) {
				this.isDef[i] = true;
				this.remain -= 1;
				this.defined[i] = api;
			}
		},

		fetch: function() {
			if ( this._fetched ) {
				return;
			}

			this._fetched = true;

			return this.shim ?
				require( this.shim.deps || [], hitch(this, this.load) ) :
				this.load();
		},

		load: function() {
			var map = this.map,
				url = map.filename,
				mod, id, done, tid;

			if ( (id = map.pluginName) ) {
				done = function( mod ) {
					if ( mod.load ) {
						if ( hasTimeout && config.timeout ) {
							tid = setTimeout(function() {
								mod.abort( url );
								onScriptTimeout( map );
							}, config.timeout);
						}
						signal( 'loading', map.id );
						mod.load(url, function( meta ) {
							clearTimeout( tid );
							saveMeta( map, meta );
						});
					}
				};
				mod = getProp( registry, id );
				if ( defined.hasOwnProperty(id) && (!mod || mod._signalComplete) ) {
					done( defined[id] );
				} else {
					mod = getModule( makeModuleMap(id) );
					mod.on( 'defined', done );
					if ( !mod._setup ) {
						mod.setup();
					}
				}
			} else {
				loadScript( map );
			}
		}
	};

	function breakCycle( mod, traced, processed ) {
		var id = mod.map.id,
			deps = mod.deps,
			i = -1, map, mid, dep;

		if ( mod.error ) {
			mod.signal( 'error', mod.error );
		} else {
			traced[id] = true;
			while ( (map = deps[++i]) ) {
				mid = map.id;
				dep = getProp( registry, mid );

				if ( dep && !dep.isDef[i] && !processed[mid] ) {
					if ( traced[mid] ) {
						mod.done( i, defined[mid] );
						mod.lookup();
						signal( 'cycle', [id, mid] );
					} else {
						breakCycle( dep, traced, processed );
					}
				}
			}
			processed[id] = true;
		}
	}

	function undef( id ) {
		var mod = getProp( registry, id ),
			map = makeModuleMap( id, null, true );

		pending = [];
		delete defined[id];
		delete fetched[map.filename];
		delete resolved[id];

		if ( mod ) {
			if ( mod.events.defined ) {
				memoried[id] = mod.events;
			}

			delete registry[id];
			delete activing[id];
		}
	}

	function fallback( id ) {
		var data = getProp( config.paths, id );

		if ( data && isArray(data) && data.length > 1 ) {
			data.shift();
			undef( id );
			getModule(makeModuleMap( id, null, true )).setup();
			return true;
		}
	}

	function lookup() {
		if ( checking ) {
			return;
		}

		checking = true;

		var requested = [],
			docheck = true,
			i = -1, id, map, mod;

		for ( id in activing ) {
			if ( (mod = getProp(activing, id)) ) {
				map = mod.map;
				if ( map.inner ) {
					requested.push( mod );
				} else if ( !mod.error && !mod._inited && mod._fetched ) {
					if ( !map.pluginName ) {
						docheck = false;
					}
				}
			}
		}

		if ( docheck ) {
			while ( (mod = requested[++i]) ) {
				breakCycle( mod, {}, {} );
			}
		}

		checking = false;
	}

	function saveMeta( map, meta ) {
		if ( !defined.hasOwnProperty(map.id) ) {
			signal( 'load', map.id );
			getModule( map ).init( meta.deps, meta.factory );
		}
	}

	function metaLoad( map ) {
		var id = map.id,
			shim = getProp( config.shim, id ) || {},
			shimName = shim.exports,
			meta, mod;

		if ( (meta = pending.shift()) ) {
			pending = [];
			saveMeta( map, meta );
		}

		// Not a cmd/amd or It's a regular script
		if ( !defined.hasOwnProperty(id) && (mod = registry[id]) && !mod._inited ) {
			if ( !shimName || !getShim(shimName) ) {
				if ( !fallback(id) ) {
					return onError({
						id: id,
						message: 'No define call'
					});
				}
			} else {
				saveMeta( map, {deps: shim.deps, factory: shim.initExport} );
			}
		}

		lookup();
	}

	function makeShim( data ) {
		return function() {
			var result;
			if ( data.init ) {
				result = data.init.apply( global, arguments );
			}
			return result || (data.exports && getShim(data.exports));
		};
	}

	function getShim( name ) {
		if ( !name ) {
			return name;
		}

		var a = name.split('.'),
			g = global, i;

		while ( (i = a.shift()) ) {
			if ( !(g = g[i]) ) {
				return false;
			}
		}

		return g;
	}

	function getModule( map ) {
		var id = map.id,
			mod = getProp( registry, id );
		return mod ? mod : (registry[id] = new KM(map));
	}

	function define( id, deps, factory ) {
		var meta, script;

		if ( typeof id !== 'string' ) {
			factory = deps;
			deps = id;
			id = undefined;
		}

		if ( !isArray(deps) ) {
			factory = deps;
			deps = [];

			if ( isFunction(factory) && factory.length ) {
				factory.toString().replace(rdeps, function( a, b, c ) {
					if ( c ) {
						deps.push( c );
					}
				});
			}
		}

		if ( !id && interactived ) {
			script = currentlyAddingScript || getInteractiveScript();
			if ( script ) {
				id = script.getAttribute('data-module');
			}
		}

		meta = {
			deps: deps,
			factory: factory
		};

		id ? saveMeta(makeModuleMap(id, null, true), meta) : pending.push(meta);
	}

	define.cmd = define.amd = {
		vendor: 'kjs'
	};

	function require( deps, onSuccess, onError ) {
		deps = isArray(deps) ? deps : [deps];
		pending = [];

		return nextTick(function() {
			var mod = getModule( makeModuleMap() );
			pending = [];
			mod.init( deps, onSuccess, onError, {setup: true} );
			lookup();
		});
	}

	require.version = version;

	require.config = function( data ) {
		var name, cfg, set, opt, shim;

		for ( name in data ) {
			set = data[name];

			switch ( name ) {
				case 'base':
					if ( set ) {
						config.base = normalize( set );
						absBase = resolve( config.base, cwd );
					}
					break;
				case 'timeout':
					config.timeout = set < 0 ? 0 : set * 1000;
					break;
				case 'paths':
				case 'map':
					if ( !config[name] ) {
						config[name] = {};
					}
					mixin( config[name], set );
				case 'shim':
					if ( !config[name] ) {
						config[name] = {};
					}
					shim = config[name];
					for ( opt in set ) {
						if ( set.hasOwnProperty(opt) ) {
							cfg = set[opt];
							if ( (cfg.exports || cfg.init) && !cfg.initExport ) {
								cfg.initExport = makeShim( cfg );
							}
							shim[opt] = cfg;
						}
					}
			}
		}
	};

	require.resolve = function( id, rel ) {
		return makeModuleMap( id, rel ).id;
	};

	require.toUrl = function( id, rel ) {
		return makeModuleMap( id, rel ).filename;
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

	signal = function( cid, args ) {
		var handlers = connects[cid],
			i = -1, handler;

		if ( handlers ) {
			handlers = handlers.slice(0);
			while( (handler = handlers[++i]) ) {
				handler( args );
			}
		}
	};

	// Run main
	runMain();

	// EXPOSE API
	global.define = define;
	global.require = global.kjs = require;

})( this );