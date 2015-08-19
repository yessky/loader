
k.js是基于CommonJS <a href="" target="_blank">Modules/AsynchronousDefinition</a> 和 <a href="" target="_blank">Modules/LoaderPlugin </a>规范实现的一个轻量级的高性能模块加载器.

文档整理中 ...


## 基本示例

查看示例<a href="http://test.veryos.com/core/index.html" target="_blank">http://test.veryos.com/core/index.html</a>.

## 如何定义模块

```js
define(["require", "./dep-a", "./dep-b"], function(depa, depb) {
	var sum = depa + depb;
	return sum + require("./text!./hello.html");
});
```

## 如何使用模块

```js
require([module-id-1, module-id-2], function(mod1, mod2){
	// do something
});
```

## 如何使用插件

```js
require(["./text!README.md"], function(txt) {
	document.write(txt);
});
	```

## License

基于 <a href="http://veryos.com/lab/license" target="_blank">MIT License</a>.
