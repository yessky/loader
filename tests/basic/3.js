define(['./4'], function(x) {
	console.log('exec 3');
	return '3 < ' + x;
});
define("unexpected", [], function() {
	console.log("unexpected anonymous module");
	return "unexpected";
});