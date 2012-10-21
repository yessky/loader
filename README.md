A Pure Module Loader runs under web browser

KModule is a pure and light implemention of CommonJS "Modules/AsynchronousDefinition" and "Modules/LoaderPlugin".

Usage

#1. define a module.

define(function(){...});

#2. use/require a module.

require(module-id[module-ids-array], function(exports){...});

#3. use module loader plugin.

<loader-plugin-module-id>!<target-resource>

see more: <a href="http://veryos.com/projects/kmodule" target="_blank">http://veryos.com/projects/kmodule</a>

Contact

admin@veryos.com aaron.xiao

Help

If you have any questions, feel free to create ticket or contact via email.

License

KModule is available under the terms of the MIT License.
