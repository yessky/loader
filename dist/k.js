/*
 * kjs - A Light And Easy-To-Use Module Loader
 * Copyright (C) 2015 aaron.xiao
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
	has.add("loader-debug-api", 1);
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

	// @config - <object>
	function configure(config) {
		baseUrl = (config.baseUrl || baseUrl).replace(/\/*$/, "/");
		mix(midsMap, config.map);
		midsMapping = computeMap(midsMap);
		if (config.paths) {
			pathsMapping = computeMap(config.paths);
		}
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
		path = path.replace(/\\/g, "/").split("/");
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

	// module status
	var requested = 1;
	var loaded = 2;
	var builtin = 3;
	var executing = 4;
	var executed = 5;
	// cache all modules
	var registry = {};
	// waiting module map
	var waiting = {};
	// for semantic debug
	if (has("loader-debug-api")) {
		requested = "requested";
		loaded = "loaded";
		builtin = "builtin";
		executing = "executing";
		executed = "executed";
	}

	// define cjs things
	var cjsmeta = {
		def: builtin,
		result: builtin,
		injected: loaded,
		executed: executed
	};
	var cjsRequire = mix(getModule('require'), cjsmeta);
	var cjsExports = mix(getModule('exports'), cjsmeta);
	var cjsModule = mix(getModule('module'), cjsmeta);

	// anonymous module
	var amd = 0;

	// @mid - <module id>
	// @deps - <dependencies array>
	// @factory - <function>
	function def(mid, deps, factory) {
		var l = arguments.length;

		// deduce module's meta data
		if (l === 1) {
			factory = mid;
			mid = deps = 0;
		} else if (l === 2) {
			factory = deps;
			deps = mid;
			mid = 0;
		}

		// normal factory should be a function
		var isNormalFactory = isFunction(factory);
		// make sure factory is a function
		if (!isNormalFactory) {
			var value = factory;
			factory = function() {
				return value;
			};
		}
		// normal mid should be a string
		if (mid && !isString(mid)) {
			mid = 0;
		}
		// common-js wrapping
		if (isNormalFactory && l === 1) {
			deps = ["require", "exports", "module"];
			// extract dependencies from factory
			factory.toString()
				.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/mg, "")
				.replace(/require\s*\(\s*(["'])(.*?[^\\])\1\s*\)/g, function(a, q, m) {
					deps.push(m);
					return a;
				});
		} else {
			if (!isArray(deps)) {
				deps = isString(deps) ? [deps] : [];
			}
		}

		// explicit define(in general, it's a built module/package)
		// so just define it
		if (mid) {
			defineModule(getModule(mid), deps, factory);
		}
		// amd branch, let's defineModule after script executed
		else {
			// take the last module defination
			// ie9- do not fire script onload right after executing the script
			if (has("ie-event-behavior")) {
				for (var i = document.scripts.length - 1, script; (script = document.scripts[i]); --i) {
					if (script.readyState === "interactive") {
						script.amd = [deps, factory];
						break;
					}
				}
			}
			// w3c browser
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
		if (config && has('loader-config-api')) {
			configure(config);
		}
		return contextRequire(deps, callback);
	}

	req.config = configure;
	req.toUrl = toUrl;
	req.resolve = resolve;

	var evented = mix({}, Evented);

	var on = req.on = function(type, listener) {
		return evented.on.call(evented, type, listener);
	};

	var signal = req.signal = function(type, args) {
		return evented.signal.call(evented, type, args);
	};

	if (has("loader-trace-api")) {
		var trace = req.trace = function(group, details) {
			signal("trace", ["trace:" + group, details]);
		};
	}

	var error = "error";
	var uid = 1;
	var execQ = [];

	// @deps - <string or array>
	// @callback - <anything>
	// @ref - <referrence module instalnce>
	function contextRequire(deps, callback, ref) {
		var module;
		// local sync require
		if (isString(deps)) {
			module = getModule(deps, ref);
			// module is not ready
			if (!module.executed) {
				throw makeError("Attempt to require unloaded module " + module.mid);
			}
			module = module.result;
		}
		else if (isArray(deps)) {
			module = getModule("*@" + uid++, ref);
			mix(module, {
				clear: 1,
				deps: resolveDependencies(deps, module, ref),
				def: callback || noop,
				injected: loaded
			});
			injectDependencies(module);
			execQ.push(module);
			checkComplete();
		}
		return module;
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
				return resolve(mid, module);
			};
			result.toUrl = function(url) {
				return toUrl(url, module);
			};
		}
		return result;
	}

	// @deps - <string or array>
	// @module - <module instance>
	// @ref - <referrence module instalnce>
	function resolveDependencies(deps, module, ref) {
		for (var result = [], i = 0, l = deps.length; i < l; ++i) {
			var dep = getModule(deps[i], ref);
			if (dep.resolveId) {
				dep.resolveId = (function(i) {
					return function(result) {
						module.deps[i] = result;
					};
				})(i);
			}
			result.push(dep);
		}
		return result;
	}

	// @module - <module instalnce>
	function injectDependencies(module) {
		idleExec(function() {
			for (var dep, i = 0, deps = module.deps; dep = deps[i]; ++i) {
				injectModule(dep);
			}
		});
	}

	// @mid - <module id>
	// @ref - <referrence module instance>
	function makeModuleMap(mid, ref) {
		mid = normalizePath(mid.charAt(0) === '.' && ref ? (ref.mid + "/../" + mid) : mid);
		var result;
		if (!(result = registry[mid])) {
			var refMap = ref && execMap(ref.mid, midsMapping);
			var midMap;
			refMap = refMap ? refMap[1] : midsMapping.star;
			if (refMap && (midMap = execMap(mid, refMap))) {
				mid = midMap[1] + mid.slice(midMap[3]);
			}
			if (!(result = registry[mid])) {
				// # apply path mapping
				var pathMap = execMap(mid, pathsMapping);
				var url = pathMap ? pathMap[1] + mid.slice(pathMap[3]) : mid;
				// # adding baseUrl
				if (!(/^(?:\/|\w+:)/.test(url))) {
					url = baseUrl + url;
				}
				// # adding .js sufmod
				if (!(/\.js(?:\?[^?]*)?$/.test(url))) {
					url += ".js";
				}
				result = {
					mid: mid,
					url: url,
					injected: 0,
					executed: 0
				};
			}
		}
		return result;
	}

	function resolve(mid, ref) {
		return makeModuleMap(mid, ref).mid;
	}

	function toUrl(name, ref) {
		var map = makeModuleMap(name + '/x', ref);
		var url = map.url;
		return url.slice(0, url.length - 5);
	}

	function resolvePrid(plugin, prid, req) {
		return plugin.normalize ? plugin.normalize(prid, req.resolve) : req.resolve(prid);
  }

	// @mid - <module id>
	// @ref - <referrence module instance>
	function getModule(mid, ref) {
		var match = mid.match(/^(.+?)\!(.*)$/);
		var result;
		if (match) {
			var plugin = getModule(match[1], ref);
			if (!match[2]) { return plugin; }
			var contextRequire = createRequire(ref);
			var prid;
			if (plugin.load) {
				prid = resolvePrid(plugin, match[2], contextRequire);
				mid = plugin.mid + "!" + prid;
			} else {
				prid = match[2];
				mid = plugin.mid + "!*@" + uid++;
			}
			result = {
				mid: mid,
				plugin: plugin,
				req: contextRequire,
				prid: prid,
				resolveId: !plugin.load,
				injected: 0,
				executed: 0
			};
		} else {
			result = makeModuleMap(mid, ref);
		}
		return registry[result.mid] || (registry[result.mid] = result);
	}

	// @module - <module instalnce>
	function injectModule(module) {
		if (!module.injected) {
			var plugin = module.plugin;
			if (plugin) {
				if (plugin.load) {
					onRequested(module);
					if (has("loader-trace-api")) {
						trace("inject-module", ["xhr", module.mid]);
					}
					plugin.load(module.prid, module.req, function(result) {
						var def = function() {
							return result;
						};
						defineModule(module, [], def);
						if (loadsum !== cursum) {
							checkComplete();
						}
					});
				} else if (plugin.loadQ) {
					plugin.loadQ.push(module);
				} else {
					plugin.loadQ = [module];
					execQ.unshift(plugin);
					injectModule(plugin);
				}
			} else {
				var cursum = loadsum;
				onRequested(module);
				if (has("loader-trace-api")) {
					trace("inject-module", ["script", module.mid]);
				}
				injectUrl(module.url, function(node) {
					if (has("ie-event-behavior") && node) {
						amd = node.amd;
					}
					if (amd) {
						defineModule(module, amd[0], amd[1]);
					}
					amd = 0;
					if (module.injected !== loaded) {
						signal(error, makeError("nonamdError", [url, module.mid]));
					}
					// some modules arrived, do check
					if (loadsum !== cursum) {
						checkComplete();
					}
				}, module);
			}
		}
	}

	var injectUrl;

	if (has("host-browser")) {
		var head = document.getElementsByTagName('head')[0];
		var baseElement = document.getElementsByTagName('base')[0];
		head = baseElement ? baseElement.parentNode : head;

		injectUrl = function(url, callback, module) {
			var node = document.createElement('script');
			var loadHandler = bind(node, 'load', 'onreadystatechange', function(e) {
				if (e.type === "load" || /complete|loaded/.test(node.readyState)) {
					loadHandler();
					errorHandler();
					callback && callback(node);
				}
			});
			var errorHandler = bind(node, 'error', 'onerror', function(e) {
				loadHandler();
				errorHandler();
				signal(error, makeError("scriptError", [url, e]));
			});
			node.type = 'text/javascript';
			node.charset = 'utf-8';
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

	var loadsum = 0;
	// @module - <module instalnce>
	// @deps - <dependencies array>
	// @def - <function>
	function defineModule(module, deps, def) {
		var mid = module.mid;

		if (has("loader-trace-api")) {
			trace("define-module", [module.mid, deps.slice(0)]);
		}

		if (module.injected === loaded) {
			signal(error, makeError("multipleDefine", [module.mid]));
			return module;
		}

		loadsum++;
		mix(module, {
			injected: loaded,
			deps: resolveDependencies(deps, module, module),
			def: def,
			cjs: {
				id: module.mid,
				url: module.url,
				exports: (module.result = {}),
				/*setExports: function(exports) {
					module.cjs.exports = exports;
				},*/
				config: function() {
					return module.config;
				}
			}
		});

		if (waiting[module.mid]) {
			onLoaded(module);
			injectDependencies(module);
		}

		return module;
	}

	var execsum = 0;
	var abortExec = {};
	var execTrace = [];

	// @module - <module instalnce>
	function execModule(module) {
		if (module.executed === executing) {
			trace("circular-dependency", [execTrace.concat(module.mid).join(" => ")]);
			return !module.def ? abortExec :	(module.cjs && module.cjs.exports);
		}
		if (!module.executed) {
			if (!module.def) {
				return abortExec;
			}

			var args = [];
			var deps = module.deps;
			var i = 0;
			var arg;

			if (has("loader-trace-api")) {
				execTrace.push(module.mid);
				trace("exec-module", ["exec", module.mid]);
			}

			module.executed = executing;

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

			// set module result
			if (has("loader-trace-api")) {
				trace("run-factory", [module.mid]);
			}
			var factory = module.def;
			try {
				var result = factory.apply(null, args);
			} catch(e) {
				signal(error, makeError("factoryThrow", [module.mid, e]));
			}
			module.result = typeof result === "undefined" && module.cjs ? module.cjs.exports : result;
			onExecuted(module);
			if (has("loader-trace-api")) {
				execTrace.pop();
			}
		}
		return module.result;
	}

	function onRequested(module) {
		module.injected = requested;
		waiting[module.mid] = 1;
		if (module.url) {
			waiting[module.url] = 1;
		}
	}

	function onLoaded(module, mids, factory) {
		module.injected = loaded;
		delete waiting[module.mid];
		if (module.url) {
			delete waiting[module.url];
		}
		if (isEmpty(waiting)) {
			// todo
		}
	}

	function onExecuted(module) {
		module.executed = executed;
		module.execsum = execsum++;
		if (module.loadQ) {
			var ret = module.result;
			if (ret.load) {
				module.load = function() {
					return ret.load.apply(ret, arguments);
				};
			}
			if (ret.normalize) {
				module.normalize = function() {
					return ret.normalize.apply(ret, arguments);
				};
			}
			for (var i = 0, loadQ = module.loadQ, src; src = loadQ[i]; ++i) {
				var prid = resolvePrid(module, src.prid, src.req);
				var mid = module.mid + "!" + prid;
				var srcModule;
				if (!(srcModule = registry[mid])) {
					registry[mid] = srcModule = mix(mix({}, src), {prid: prid, mid: mid});
				}
				src.resolveId(srcModule);
				delete registry[src.mid];
				injectModule(srcModule);
			}
			module.loadQ = null;
		}
		for (var i = 0; i < execQ.length;) {
			if (execQ[i] === module) {
				execQ.splice(i, 1);
			} else {
				i++;
			}
		}
		if (module.clear) {
			delete registry[module.mid];
		}
	}

	var guarding = 0;

	function idleExec(exec) {
		try {
			guarding++;
			exec();
		} finally {
			guarding--;
		}
	}

	function checkComplete() {
		if (guarding) { return; }
		idleExec(function() {
			for (var cursum, module, i = 0; i < execQ.length;) {
				cursum = execsum;
				module = execQ[i];
				execModule(module);
				if (cursum !== execsum) {
					i = 0;
				} else {
					i++;
				}
			}
		});
	}

	// EXPOSE API
	global.define = def;
	global.require = req;

}( this );