
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