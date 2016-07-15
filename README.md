
基于CommonJS <a href="" target="_blank">Modules/AsynchronousDefinition</a> 和 <a href="" target="_blank">Modules/LoaderPlugin </a>规范实现的一个轻量级的高性能模块加载器.

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

## 在线基本示例

查看示例<a href="http://test.veryos.com/core/index.html" target="_blank">http://test.veryos.com/core/index.html</a>.

## 如何构建线上版本

<a href="//github.com/yessky/kspack">kspack为k.js量身订做的打包工具</a>

<a href="//github.com/yessky/spa-sample-project">查看使用k.js的示例项目</a>

<a href="http://m.music.migu.cn">咪咕音乐触屏版</a>

## License

使用时请添加并保留版权信息

基于 <a href="https://github.com/yessky/loader/blob/master/LICENSE.md">MIT License.</a>
