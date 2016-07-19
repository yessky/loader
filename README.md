# k.js - a module loader

A Super Fast And Light Module Loader implemented CommonJS [Modules/AsynchronousDefinition][amdspec] and [Modules/LoaderPlugin][pluginspec] Specifications.

基于CommonJS [Modules/AsynchronousDefinition][amdspec] 和 [Modules/LoaderPlugin][pluginspec] 规范实现的一个轻量级的高性能模块加载器.

[amdspec]: http://wiki.commonjs.org/wiki/Modules/AsynchronousDefinition
[pluginspec]: http://wiki.commonjs.org/wiki/Modules/LoaderPlugin

## Usage - 用法

### 1. define a module - 定义模块

```js
// amd(requirejs) style － amd(requirejs)风格
define(["require", "./dep-a", "./dep-b"], function(depa, depb) {
	var sum = depa + depb;
	return sum + require("./text!./hello.html");
});
// cjs style - cjs风格
define(function(require, exports, module) {
	return require("./lang").indexOf([1, 2, 3], 4) > -1;
});
```

### 2. require/load a module - 加载/使用模块

```js
// synax - 语法
require([module-id-1, module-id-2], function(mod1, mod2){
	// do something
});
// example - 例子
require(["./lang"], function(lang) {
	console.log(lang.indexOf(["a", "b"], "c"));
});
```

### 3. use plugin - 如何使用插件

```js
// use text plugin to load a file
require(["./text!README.md"], function(txt) {
	document.write(txt);
});
```

## Install - 如何获取loader

1. build from source

```
workspace@yourname: git clone https://github.com/yessky/loader.git
workspace@yourname: cd loader
loader@yourname:		gulp release
copy dist/k.min.js to your project - 复制dist/k.min.js到你的项目中
```

2. directly download

	[product version][min]

	[devlopment version][max]

[min]: https://raw.githubusercontent.com/yessky/loader/master/dist/k.min.js
[max]: https://raw.githubusercontent.com/yessky/loader/master/dist/k.js

## Run tests and demos - 测试和使用示例

	clone the source to your local machine. then run `gulp` to run tests and view demos

## Built/Package - 如何构建线上版本

["kspack": A Builder/Packer/Optimizer for the loader - kspack为k.js量身订做的打包工具][builder]

[A spa-sample-project using the loader - 查看完整基于loader的单页示例项目][sample]

[A running proudct based on the loader - 基于该loader的生产项目 咪咕音乐触屏版][product]

[builder]: https://github.com/yessky/kspack
[sample]: https://github.com/yessky/spa-sample-project
[product]: http://m.music.migu.cn

## License - 授权

[MIT License][license]

[license]: https://github.com/yessky/loader/blob/master/LICENSE.md
