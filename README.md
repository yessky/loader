A Light and Easy-To-Use Module Loader
===

k.js is a pure and light implemention of CommonJS <a href="" target="_blank">Modules/AsynchronousDefinition</a> and <a href="" target="_blank">Modules/LoaderPlugin</a>.

simple samples at: <a href="http://test.veryos.com/core/index.html" target="_blank">http://test.veryos.com/core/index.html</a>.

details coming soon.

## Usage

1. define a module.

	define(function(){...});

2. use/require a module.

	require(module-id[module-ids-array], function(exports){...});

3. use module loader plugin.

	&lt;loader-plugin-module-id&gt;!&lt;target-resource&gt;

	see more: <a href="http://veryos.com/projects/kmodule" target="_blank">http://veryos.com/projects/kmodule</a>

## Contact

admin@veryos.com aaron.xiao

## Help

If you have any questions, feel free to <a href="https://github.com/yessky/kmodule/issues/new" target="_blank">create ticket</a> or <a href="mailto:admin@veryos.com" target="_blank">contact via email</a>.

## License

KModule is available under the terms of the <a href="http://veryos.com/lab/license" target="_blank">MIT License</a>.
