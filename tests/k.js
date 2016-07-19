/*
 * k.js - A Light, Super Fast And Easy-To-Use Module Loader
 * Copyright (C) 2013-2099 aaron.xiao<admin@veryos.com>
 */

!function( global ) {

	// ===========================================
	// has.js and sniff
	// ===========================================
	var has = req.has = (function () {
		var hasCache = {};
		var global = this;
		var document = global.document;
		var element = document && document.createElement("Div");
		var has = function (name) {
			return typeof hasCache[name] === "function" ? (hasCache[name] = hasCache[name](global, document, element)) : hasCache[name];
		};
		has.add = function (name, test, now, force) {
			(!(name in hasCache) || force) && (hasCache[name] = test);
			now && has(name);
		};
		return has;
	})();

	has.add("host-browser", typeof document !== "undefined" && typeof location !== "undefined");
	has.add("ie-event-behavior", has("host-browser") && document.attachEvent && typeof Windows === "undefined" && (typeof opera === "undefined" || opera.toString() != "[object Opera]"));
	has.add("host-node", typeof process === "object" && process.versions && process.versions.node);
	has.add("loader-debug-api", 0);
	has.add("loader-config-api", 1);
	has.add("loader-trace-api", 1);


	// ===========================================
	// utils
	// ===========================================
	var toString = {}.toString;

	var slice = [].slice;

	function isFunction(it) {
		return toString.call(it) === "[object Function]";
	}

	function isArray(it) {
		return toString.call(it) === "[object Array]";
	}

	function isString(it) {
		return toString.call(it) === "[object String]";
	}

	function isEmpty(it) {
		for (var p in it) {
			return 0;
		}
		return 1;
	}

	function mix(dest, src) {
		for (var name in src) {
			dest[name] = src[name];
		}
		return dest;
	}

	function forEach(array, iter) {
		if (array.forEach) {
			array.forEach(iter);
		} else {
			for (var i = 0, l = array.length; i < l; ++i) {
				iter(array[i], i);
			}
		}
	}

	function makeError(error, info) {
		var descr = {src: "kjs.loader"};
		if (info) { descr.info = info; }
		return mix(new Error(error), descr);
	}

	function noop() {}

	var Evented = {
		signal: function(type, args) {
			var queue = this.events && this.events[type];
			if (queue && (queue = queue.slice(0))) {
				args = isArray(args) ? args : [args];
				for (var i = 0, listener; listener = queue[i]; ++i) {
					listener.apply(null, args);
				}
			}
		},
		on: function(type, listener) {
			var events = this.events || (this.events = {});
			var queue = this.events[type] || (events[type] = []);
			queue.push(listener);
			return {
				remove: function() {
					for (var i = 0; i < queue.length; i++) {
						if (queue[i] === listener) {
							return queue.splice(i, 1);
						}
					}
				}
			};
		}
	};

	function bind(node, eventName, ieName, handler) {
		if (has("ie-event-behavior")) {
			node.attachEvent(ieName, handler);
			return function() {
				node.detachEvent(ieName, handler);
			};
		} else {
			node.addEventListener(eventName, handler, false);
			return function() {
				node.removeEventListener(eventName, handler, false);
			};
		}
	}

	// ===========================================
	// loader
	// ===========================================
	var baseUrl = "./";
	var midsMap = {};
	var midsMapping = [];
	var pathsMapping = [];
	var shims = {};

	// @config - <object>
	function configure(config) {
		baseUrl = (config.baseUrl || baseUrl).replace(/\/*$/, "/");
		mix(midsMap, config.map);
		midsMapping = computeMap(midsMap);
		if (config.paths) {
			pathsMapping = computeMap(config.paths);
		}
		mix(shims, config.shim);
		if (has("loader-trace-api")) {
			trace("config", [config]);
		}
	}

	function computeMap(map) {
		var result = [];
		for (var mid in map) {
			var value = map[mid];
			var isSubMap = typeof value === "object";
			var item = [
				mid,
				isSubMap ? computeMap(value) : value,
				new RegExp("^" + mid.replace(/[-\[\]{}()*+?.,\\\^$|#\s]/g, "\\$&") + "(?:\/|$)"),
				mid.length,
				mid.split("/").length
			];
			result.push(item);
			if (isSubMap && mid === "*") {
				result.star = item[1];
			}
		}
		result.sort(function (a, b) {
			return a[4] === b[4] ? a[3] - a[3] : a[4] - b[4];
		});
		return result;
	}

	function execMap(mid, map) {
		if (map) {
			for (var i = 0, l = map.length; i < l; ++i) {
				if (map[i][2].test(mid)) {
					 return map[i];
				}
			}
		}
		return null;
	}

	function normalizePath(path) {
		var result = [];
		var seg, last;
		path = path.split("/");
		while (path.length) {
			seg = path.shift();
			if (seg === ".." && result.length && last !== "..") {
				result.pop();
				last = result[result.length - 1];
			} else if (seg !== ".") {
				result.push(last = seg);
			}
		}
		return result.join("/");
	}

	function makeShim(module) {
		var shim = shims[module.mid];
		var exports = shim.exports;
		return {
			deps: shim.deps || [],
			def: isFunction(exports) ? exports :
				isString(exports) ? makeDefine(getObject(exports)) : 
				makeDefine(exports)
		}
	}

	function makeDefine(exports) {
		return function() {
			return exports;
		}
	}

	function getObject(expr) {
		var p = expr.split(".");
		var g = window;
		for (var i = 0, l = p.length; i < l; ++i) {
			if (!g[p[i]]) {
				return null;
			}
			g = g[p[i]];
		}
		return g;
	}

	var hub = mix({}, Evented);

	function on(type, listener) {
		return hub.on.call(hub, type, listener);
	}

	function signal(type, args) {
		return hub.signal.call(hub, type, args);
	}

	// module states
	var REQUESTED = 1;
	var LOADED = 2;
	var EXECUTING = 4;
	var EXECUTED = 5;

	if (has("loader-debug-api")) {
		REQUESTED = "requested";
		LOADED = "loaded";
		EXECUTING = "executing";
		EXECUTED = "executed";
	}

	// registered modules map
	var registry = {};
	// @mid - <module id>
	// @ref - <referrence module instance>
	function makeModuleMap(mid, ref, established) {
		var result;
		if (!established && ref && mid.charAt(0) === ".") {
			mid = ref.mid + "/../" + mid;
		}
		mid = normalizePath(mid);
		if (!(result = registry[mid])) {
			var refMap = ref && execMap(ref.mid, midsMapping);
			var midMap;
			refMap = refMap ? refMap[1] : midsMapping.star;
			if (refMap && (midMap = execMap(mid, refMap))) {
				mid = midMap[1] + mid.slice(midMap[3]);
			}
			if (!(result = registry[mid])) {
				var pathMap = execMap(mid, pathsMapping);
				var url = pathMap ? pathMap[1] + mid.slice(pathMap[3]) : mid;
				if (!(/^(?:\/|\w+:)/.test(url))) {
					url = baseUrl + url;
				}
				if (!(/\.js(?:\?[^?]*)?$/.test(url))) {
					url += ".js";
				}
				result = {
					mid: mid,
					url: normalizePath(url),
					injected: 0,
					executed: 0
				};
			}
		}
		return result;
	}

	// @mid - <module id>
	// @ref - <referrence module instance>
	function getModule(mid, ref, established) {
		var match = mid.match(/^(.+?)\!(.*)$/);
		var result;
		if (match) {
			var plugin = getModule(match[1], ref, established);
			var req = createRequire(ref);
			var ready = !!plugin.load;
			var prid;
			if (established) {
				prid = match[2];
				mid = plugin.mid + "!" + prid;
			}
			// deduce runtime module-id
			else {
				if (ready) {
					prid = resolveResource(plugin, match[2], req);
					mid = plugin.mid + "!" + prid;
				} else {
					prid = match[2];
					mid = plugin.mid + "!*@pm" + uid++;
				}
			}
			result = {
				mid: mid,
				plugin: plugin,
				req: req,
				prid: prid,
				fix: !ready,
				injected: 0,
				executed: 0
			};
		} else {
			result = makeModuleMap(mid, ref, established);
		}
		return registry[result.mid] || (registry[result.mid] = result);
	}

	function resolve(name, ref) {
		var map = makeModuleMap(name + "/x", ref);
		return {
			mid: map.mid.slice(0, map.mid.length - 2),
			url: map.url.slice(0, map.url.length - 5)
		}
	}

	function toUrl(name, ref) {
		return resolve(name, ref).url;
	}

	function resolveResource(plugin, prid, req) {
		return plugin.normalize ? plugin.normalize(prid, req.resolve) : req.resolve(prid);
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

  function relative(from, to) {
		to = normalizePath(to);
		var fromParts = trimArray( from.split('/') );
		var toParts = trimArray( to.split('/') );
		var length = Math.min( fromParts.length, toParts.length );
		var samePartsLength = length;
		for (var i = 0; i < length; i++) {
			if (fromParts[i] !== toParts[i]) {
				samePartsLength = i;
				break;
			}
		}
		var outputParts = [];
		for (var i = samePartsLength; i < fromParts.length; i++) {
			outputParts.push( '..' );
		}
		outputParts = outputParts.concat(toParts.slice(samePartsLength));
		return outputParts.join('/');
	}

	// built-in cjs module metas(require, exports, module)
	var cjsmeta = {
		def: true,
		result: true,
		injected: LOADED,
		executed: EXECUTED
	};
	var cjsRequire = mix(getModule("require"), cjsmeta);
	var cjsExports = mix(getModule("exports"), cjsmeta);
	var cjsModule = mix(getModule("module"), cjsmeta);

	// @mid - <module id>
	// @deps - <dependencies array>
	// @factory - <function>
	function def(mid, deps, factory) {
		var l = arguments.length;
		if (l === 1) {
			factory = mid;
			mid = deps = 0;
		} else if (l === 2) {
			factory = deps;
			deps = mid;
			mid = 0;
		}
		if (mid && !isString(mid)) { mid = 0; }
		// cjs module
		if (isFunction(factory) && l === 1) {
			deps = ["require", "exports", "module"];
			// extract dependencies from factory
			factory.toString()
				.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/mg, "")
				.replace(/require\s*\(\s*(["'])(.*?[^\\])\1\s*\)/g, function(a, q, m) {
					deps.push(m);
					return a;
				});
		}
		// make sure deps is an array
		else if (!isArray(deps)) {
			deps = isString(deps) ? [deps] : [];
		}
		// explict module id:
		// 	1. devlopment version，explict module id should be relative to baseUrl
		// 	2. built version，module id was computed by the packer
		if (mid) {
			defineModule(getModule(mid, null, true), deps, factory);
		}
		// ie9- below, async loading
		else {
			if (has("ie-event-behavior")) {
				for (var i = document.scripts.length - 1, script; (script = document.scripts[i]); --i) {
					if (script.readyState === "interactive") {
						script.amd = [deps, factory];
						break;
					}
				}
			}
			else {
				amd = [deps, factory];
			}
		}
	}

	// @deps - <dependencies array>
	// @callbak - <anything>
	function req(config, deps, callback) {
		// require("mid") or require(["mid"])
		if (isArray(config) || isString(config)) {
			callback = deps;
			deps = config;
			config = null;
		}
		if (config && has("loader-config-api")) {
			configure(config);
		}
		return contextRequire(deps, callback);
	}

	req.async = function(mids, cb) {
		return req(mids, cb)
	};
	req.on = on;
	req.config = configure;
	req.resolve = function(mid, ref) {
		return resolve(mid, ref).mid;
	};
	req.toUrl = toUrl;
	req.relative = function(path) {
		return relative(baseUrl, toUrl(path));
	};
	req.context = function(mid) {
		return createRequire(getModule(mid));
	};
	if (has("loader-trace-api")) {
		var trace = req.trace = function(group, details) {
			signal("trace", ["trace:" + group, details]);
		};
	}

	var error = "error";
	var uid = 1;
	var execQ = [];
	var guardCheck = 0;

	// @deps - <string or array>
	// @callback - <anything>
	// @ref - <referrence module instalnce>
	function contextRequire(deps, callback, ref) {
		var module;
		// load module's export
		if (isString(deps)) {
			module = getModule(deps, ref);
			if (!module.executed) {
				throw makeError("Attempt to require unloaded module " + module.mid);
			}
			return module.result;
		}
		// load module and its export
		else if (isArray(deps)) {
			module = getModule("*@" + uid++, ref);
			mix(module, {
				clear: 1,
				deps: resolveDeps(deps, module, ref),
				def: callback || noop,
				injected: LOADED
			});
			injectDeps(module);
			execQ.push(module);
			checkComplete();
		}
	}

	var isIdle = req.idle = function() {
		return !amd && isEmpty(waiting) && !execQ.length && !guardCheck;
	};

	function idleExec(exec) {
		++guardCheck;
		exec();
		--guardCheck;
		if (isIdle()) {
			signal("idle", []);
		}
	}

	function checkComplete() {
		!guardCheck && idleExec(function() {
			for (var cursum, module, i = 0; i < execQ.length;) {
				module = execQ[i];
				if (module.executed === EXECUTED) {
					execQ.splice(i, 1);
				} else {
					cursum = execsum;
					execModule(module);
					if (cursum !== execsum) {
						i = 0;
					} else {
						i++;
					}
				}
			}
		});
	}

	var amd = false;
	var waiting = {};
	var loadsum = 0;
	var execsum = 0;
	var abortExec = {};
	var execTrace = [];

	// @module - <module instalnce>
	// @deps - <dependencies array>
	// @def - <function>
	function defineModule(module, deps, def) {
		var mid = module.mid;
		if (has("loader-trace-api")) {
			trace("define-module", [module.mid, deps.slice(0)]);
		}
		if (module.injected === LOADED) {
			signal(error, makeError("multipleDefine", [module.mid]));
			return module;
		}
		loadsum++;
		mix(module, {
			injected: LOADED,
			deps: resolveDeps(deps, module, module),
			def: def,
			cjs: {
				id: module.mid,
				url: module.url,
				exports: (module.result = {})
			}
		});
		if (waiting[mid] || waiting[module.url]) {
			delete waiting[mid];
			injectDeps(module);
		}
		return module;
	}

	// @module - <module instalnce>
	function execModule(module) {
		// circular dependecies
		if (module.executed === EXECUTING) {
			trace("circular-dependency", [execTrace.concat(module.mid).join(" => ")]);
			return module.cjs.exports;
		}
		// execute module
		if (!module.executed) {
			if (!module.def) { return abortExec }
			var args = [];
			var deps = module.deps;
			var i = 0;
			var arg;
			if (has("loader-trace-api")) {
				execTrace.push(module.mid);
				trace("exec-module", ["exec", module.mid]);
			}
			module.executed = EXECUTING;
			while (arg = deps[i++]) {
				var ret = ((arg === cjsRequire) ? createRequire(module) :
					((arg === cjsExports) ? module.cjs.exports :
						((arg === cjsModule) ? module.cjs :
							execModule(arg))));
				if (ret === abortExec) {
					module.executed = 0;
					if (has("loader-trace-api")) {
						trace("exec-module", ["abort", module.mid]);
						execTrace.pop();
					}
					return abortExec;
				}
				args.push(ret);
			}
			// run factory, export module
			if (has("loader-trace-api")) {
				trace("run-factory", [module.mid]);
			}
			var factory = module.def;
			var result = isFunction(factory) && !module.plugin ? factory.apply(global, args) : factory;
			result = module.result = typeof result === "undefined" && module.cjs ? module.cjs.exports : result;
			module.executed = EXECUTED;
			module.execsum = execsum++;
			if (module.clear) { delete registry[module.mid] }
			if (module.url) { delete waiting[module.url] }
			if (module.loadQ) {
				if (result && result.load) {
					forEach(["load", "normalize"], function(n) {
						module[n] = result[n];
					});
				}
				forEach(module.loadQ, function(src) {
					var prid = resolveResource(module, src.prid, src.req);
					var mid = module.mid + "!" + prid;
					var resource;
					if (!(resource = registry[mid])) {
						resource = mix(mix({}, src), {prid: prid, mid: mid});
						injectPlugin(registry[mid] = resource);
					}
					src.fix(resource);
					delete registry[src.mid];
				});
				module.loadQ = undefined;
			}
			if (has("loader-trace-api")) { execTrace.pop() }
		}
		return module.result;
	}

	// @module - <module instance>
	function injectModule(module) {
		if (module.plugin) {
			injectPlugin(module);
		} else if (!module.injected) {
			var cursum = loadsum;
			module.injected = REQUESTED;
			waiting[module.mid] = true;
			waiting[module.url] = true;
			if (has("loader-trace-api")) {
				trace("inject-module", ["script", module.mid]);
			}
			injectUrl(module.url, function(node) {
				if (has("ie-event-behavior") && node) {
					amd = node.amd;
				}
				if (amd) {
					defineModule(module, amd[0], amd[1]);
					amd = false;
				}
				if (module.injected !== LOADED && shims[module.mid]) {
					var shim = makeShim(module);
					defineModule(module, shim.deps, shim.def);
				}
				if (module.injected !== LOADED) {
					signal(error, makeError("nonamdError", [module.url, module.mid]));
				}
				if (cursum !== loadsum) {
					checkComplete();
				}
			}, module);
		}
	}

	// @module - <module instance>
	function injectPlugin(module) {
		var plugin = module.plugin;
		if (plugin.load) {
			var prid = resolveResource(plugin, module.prid, module.req);
			var mid = plugin.mid + "!" + prid;
			var src = module;
			if (!registry[mid]) {
				registry[mid] = mix(mix({}, src), {prid: prid, mid: mid});
				src.fix(module);
				delete registry[src.mid];
			}
			module = registry[mid];
			if (module.injected) { return }
			module.injected = REQUESTED;
			if (has("loader-trace-api")) {
				trace("inject-module", ["xhr", module.mid]);
			}
			plugin.load(module.prid, module.req, function(result) {
				defineModule(module, [], result);
				checkComplete();
			});
		} else if (plugin.loadQ) {
			plugin.loadQ.push(module);
		} else {
			plugin.loadQ = [module];
			execQ.unshift(plugin);
			injectModule(plugin);
		}
	}

	// @module - <module instalnce>
	function createRequire(module) {
		var result = (!module && req) || module.require;
		if (!result) {
			module.require = result = function(mid, callback) {
				return contextRequire(mid, callback, module);
			};
			mix(result, req);
			result.resolve = function(mid) {
				return resolve(mid, module).mid;
			};
			result.toUrl = function(url) {
				return toUrl(url, module);
			};
			result.context = function(mid) {
				return createRequire(getModule(mid, module));
			};
		}
		return result;
	}

	// @deps - <string or array>
	// @module - <module instance>
	// @ref - <referrence module instalnce>
	function resolveDeps(deps, module, ref) {
		var result = [];
		forEach(deps, function(mid, i) {
			var dep = getModule(mid, ref);
			if (dep.fix) {
				dep.fix = function(result) {
					module.deps[i] = result;
				};
			}
			result.push(dep);
		});
		return result;
	}

	// @module - <module instalnce>
	function injectDeps(module) {
		idleExec(function() {
			forEach(module.deps, function(dep) {
				injectModule(dep);
			});
		});
	}

	var injectUrl;

	if (has("host-browser")) {
		var head = document.getElementsByTagName("head")[0];
		var baseElement = document.getElementsByTagName("base")[0];
		var fetched = {};
		head = baseElement ? baseElement.parentNode : head;

		injectUrl = function(url, callback) {
			if (fetched[url]) { return }
			fetched[url] = true;
			var node = document.createElement("script");
			var loadHandler = bind(node, "load", "onreadystatechange", function(e) {
				if (e.type === "load" || /complete|loaded/.test(node.readyState)) {
					loadHandler();
					errorHandler();
					callback && callback(node);
				}
			});
			var errorHandler = bind(node, "error", "onerror", function(e) {
				loadHandler();
				errorHandler();
				signal(error, makeError("scriptError", [url, e]));
			});
			node.type = "text/javascript";
			node.charset = "utf-8";
			//node.crossOrigin = "anonymous";
			node.async = true;
			node.src = url;
			if (baseElement) {
				head.insertBefore(node, baseElement);
			} else {
				head.appendChild(node);
			}
			return node;
		};
	}

	// Provide a built-in dom-ready API instead of a modular dom-ready
	// to ensure that dom-ready is more faster and safer
	if ( has("host-browser") ) {
		var doc = global.document,
			readyStates = { "loaded": 1, "complete": 1 },
			isReady = !!(readyStates[doc.readyState] || doc.body),
			readyList = [],
			recursiveGuard,
			processQueue = function() {
				if ( recursiveGuard ) {
					return;
				}
				recursiveGuard = true;
				while ( readyList.length ) {
					try {
						(readyList.shift())( doc );
					} catch(err) {}
				}
				recursiveGuard = false;
			},
			ensureReady = function() {
				if ( !doc.body ) {
					return setTimeout( ensureReady );
				}
				isReady = true;
				processQueue();
			},
			completed = function( e ) {
				if ( doc.addEventListener || e.type === "load" || readyStates[doc.readyState] ) {
					unbindListener();
					ensureReady();
				}
			},
			unbindListener = function() {
				if ( doc.addEventListener ) {
					doc.removeEventListener( "DOMContentLoaded", completed, false );
					global.removeEventListener( "load", completed, false );

				} else {
					doc.detachEvent( "onreadystatechange", completed );
					global.detachEvent( "onload", completed );
				}
			},
			ready = req.ready = function( listener ) {
				readyList.push( listener );
				if ( isReady ) {
					processQueue();
				}
			};

		// TODO: consider working as plugin loader
		/*ready.load = function() {

		};*/

		if ( !isReady ) {
			if ( doc.readyState === "complete" ) {
				setTimeout( ensureReady );
			} else if ( doc.addEventListener ) {
				doc.addEventListener( "DOMContentLoaded", completed, false );
				global.addEventListener( "load", completed, false );
			} else {
				doc.attachEvent( "onreadystatechange", completed );
				global.attachEvent( "onload", completed );
				var top = false;
				try {
					top = global.frameElement == null && doc.documentElement;
				} catch(e) {}
				if ( top && top.doScroll ) {
					(function doScrollCheck() {
						if ( !isReady ) {
							try {
								top.doScroll("left");
							} catch(e) {
								return setTimeout( doScrollCheck, 50 );
							}
							unbindListener();
							ensureReady();
						}
					})();
				}
			}
		}
	}

	// EXPOSE API
	if (typeof require === "object") { req(require) }
	def.amd = def.cmd = {vendor: "http://veryos.com"};
	global.define = def;
	global.require = req;

	if (has("loader-debug-api")) {
		req.injectUrl = injectUrl;
		req.modules = registry;
		req.exeQ = execQ;
		req.waiting = waiting;
		req.normalizePath = normalizePath;
		req.makeModuleMap = makeModuleMap;
	}

}( this );