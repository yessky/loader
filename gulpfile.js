var gulp = require("gulp")
	, gutil = require("gulp-util")

	, clean = require("gulp-clean")
	, concat = require("gulp-concat")

	, uglify = require("gulp-uglify")

	, browserSync = require("browser-sync").create()
	, reload = browserSync.reload

	, sequence = require("run-sequence")
	, plumber = require("gulp-plumber")

	, through2 = require("through2");

// # app configs
var src = "src/";
var dest = "dist/";
var product = false;


// # clean
gulp.task("clean", function () {
	return gulp.src(dest)
		.pipe(plumber())
		.pipe(clean());
});

// # concat
gulp.task("concat", function() {
	var sortFiles = function(sortFn) {
		var files = [];
		return through2.obj(
			function(file, enc, done) {
				files.push(file);
				done();
			},
			function(done) {
				var self = this;
				files = sortFn(files);
				files.forEach(function(file) {
					self.push(file);
				});
				done();
			}
		);
	};
	var setHasFeature = function(features) {
		var source = '';
		for (var name in features) {
			var cfg = features[name];
			if (typeof cfg === "string") {
				cfg = '"' + cfg.replace(/"/g, '\"') + '"';
			}
			if (cfg !== undefined) {
				source += '\thas.add("' + name + '", ' + cfg + ');\n';
			}
		}
		var configFile = new gutil.File({
		  path: 'has.config.js',
		  contents: new Buffer(source)
	  });
		return through2.obj(function(file, enc, done) {
			this.push(file);
			if (file.path.indexOf("has.js") > -1) {
				this.push(configFile);
			}
			done();
		});
	};
	return gulp.src([
			src + "intro.js"
			, src + "has.js"
			, src + "util.js"
			, src + "loader.js"
			, src + "outro.js"
		])
		.pipe(plumber())
		.pipe(setHasFeature({
			"loader-debug-api": product ? 0 : 1,
			"loader-config-api": 1,
			"loader-trace-api": 1
		}))
		.pipe(concat("k.js"))
		.pipe(gulp.dest(dest))
		.pipe(gulp.dest("./tests/"));
});

// # compress
gulp.task("uglify", function() {
	return gulp.src([dest + "k.js"])
		.pipe(uglify())
		.pipe(through2.obj(function(file, enc, cb) {
			file.path = file.path.replace(".js", ".min.js");
			this.push(file);
			cb();
		}))
		.pipe(gulp.dest(dest))
});

// # start test server
gulp.task("serv", function() {
	browserSync.init({
		ui: false,
		port: 7000,
		server: {
			baseDir: "./tests"
		}
	});
});


// # build
gulp.task("default", function(cb) {
	product = false;
	sequence("clean", "concat", "serv", cb);
});

gulp.task("release", function(cb) {
	product = true;
	sequence("clean", "concat", "uglify", cb);
});