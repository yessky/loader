
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