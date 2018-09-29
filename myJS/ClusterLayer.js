/**
 * 0821 这段代码具有一定的参考性，可以学习
 * @woniugis
 */
define([
    "dojo/_base/declare",
    "dojo/_base/array",
    "esri/Color",
    "dojo/_base/connect",
    "esri/SpatialReference",
    "esri/geometry/Point",
    "esri/graphic",
    "esri/symbols/SimpleMarkerSymbol",
    "esri/symbols/TextSymbol",
    "esri/geometry/webMercatorUtils",
    "esri/dijit/PopupTemplate",
    "esri/layers/GraphicsLayer"
    ], function (
        declare, arrayUtils, Color, connect,
        SpatialReference, Point, Graphic, SimpleMarkerSymbol, TextSymbol, webMercatorUtils,
        PopupTemplate, GraphicsLayer
        ) {
    /**
     * declare
     */
    return declare([GraphicsLayer], {
            id:"clusterLayer",
            constructor: function(options) {
                /**
                 * 聚类图层本质上就是GraphicsLayer,构建其构造函数
                 * data:  Object[]  点数据集合，包含点的金纬度坐标及其他属性信息
                 * distance:  Number(Optional),同一个聚类集合中聚类点之间允许的最大距离（像素值），默认为50
                 * labelColor:  String(Optional),聚类标签的颜色，默认值为#fff (white).
                 * labelOffset:  String(Optional),聚类标签的偏移值，默认为align=-5
                 * resolution:  Number(Required),地图坐标中，像素的宽度（地理坐标与投影坐标有差异）：map.extent.getWidth() / map.width
                 * showSingles:  Boolean(Optional),当单击聚类集合时，是否显示图形，默认为显示
                 * singleSymbol:  MarkerSymbol Marker Symbol (picture or simple).可选项，用于显示单独点的样式，默认为小灰点
                 * singleTemplate:  PopupTemplate? 可选项，点击弹出单独点的弹出框，显示其属性信息
                 * maxSingles:  Number? 可选项，是否显示群集中的点的图形的阈值。默认值为1000。当超过1000时，弹出提示框
                 * webmap:  Boolean? 可选项，判断地图是否是Arcgis网络地图，默认为false
                 * spatialReference:  SpatialReference? 可选项，图层graphics的空间参考，应该匹配地图的空间参考，默认为102100（web mercator）
                 * @type {number}
                 * @private
                 */
                this._clusterTolerance = options.distance || 50;
                this._clusterData = options.data || [];
                this._clusters = [];
                this._clusterLabelColor = options.labelColor || "#000";
                this._clusterLabelOffset = (options.hasOwnProperty("labelOffset")) ? options.labelOffset : -5;
                // graphics代表一个单独的点
                this._singles = []; // populated when a graphic is clicked
                this._showSingles = options.hasOwnProperty("showSingles") ? options.showSingles : true;
                // 设置单独点的简单marker
                /**
                 * 此段代码可以拓展，可以根据点的属性来给不同的点不同的显示marker
                 * 修改ClassBreaksRenderer.js
                 * 参考文章：https://blog.csdn.net/sinat_33596545/article/details/76851867
                 * _singleSym:function(p){
                        var sms = SimpleMarkerSymbol;
                        var type;
                        if(p.attributes.carStatus == "1"){
                           if(p.attributes.onoffstate == "1"){
                        }
                        return new sms({"url":type,
                            "height":15,
                            "width":15,
                            "type":"esriPMS",
                            "angle": 0});
                        },
                 */
                var sms = SimpleMarkerSymbol;
                this._singleSym = options.singleSymbol || new sms("circle", 6, null, new Color("#d8dfe1"));
                this._singleTemplate = options.singleTemplate || new PopupTemplate({
                    "title": "",
                    "description": "{*}"
                });
                this._maxSingles = options.maxSingles || 50;

                this._webmap = options.hasOwnProperty("webmap") ? options.webmap : false;
                this._sr = options.spatialReference || new SpatialReference({
                    "wkid": 102100
                });
                this._zoomEnd = null;
            },

            // 重写 esri/layers/GraphicsLayer 的方法
            _setMap: function(map, surface) {
                // this._clusterResolution = map.extent.getWidth() / map.width; // probably a bad default...
                this._initMap();
                // 地图缩放后重新进行聚类
                this._zoomEnd = connect.connect(map, "onZoomEnd", this, function() {
                    if (map.spatialReference.isWebMercator()) {
                        this._clusterResolution = map.extent.getWidth() / map.width; // probably a bad default...
                    }
                    else {
                        //WGS 84，不是web Mercator投影
                        var latlng1 = new Point(map.extent.xmax, map.extent.ymax, map.spatialReference); //右上角
                        var latlng2 = new Point(map.extent.xmin, map.extent.ymin, map.spatialReference); //左下角
                        var webMercator1 = webMercatorUtils.geographicToWebMercator(latlng1);
                        var webMercator2 = webMercatorUtils.geographicToWebMercator(latlng2);
                        this._clusterResolution = (webMercator1.x - webMercator2.x) / map.width;
                    }
                    this.clear();
                    this._clusterGraphics();
                });
                // GraphicsLayer will add its own listener here
                var div = this.inherited(arguments);
                return div;
            },

            _initMap:function () {
                if (map.spatialReference.isWebMercator()) {
                    this._clusterResolution = map.extent.getWidth() / map.width; // probably a bad default...
                }
                else {
                    //WGS 84转换为web Mercator投影
                    var latlng1 = new Point(map.extent.xmax, map.extent.ymax, map.spatialReference); //右上角
                    var latlng2 = new Point(map.extent.xmin, map.extent.ymin, map.spatialReference); //左下角
                    var webMercator1 = webMercatorUtils.geographicToWebMercator(latlng1);
                    var webMercator2 = webMercatorUtils.geographicToWebMercator(latlng2);
                    this._clusterResolution = (webMercator1.x - webMercator2.x) / map.width;
                }
                this.clear();
                this._clusterGraphics();
            },

            // _unsetMap: function() {
            //     this.inherited(arguments);
            //     connect.disconnect(this._zoomEnd);
            // },

            // 公共聚类图层方法（聚类的核心方法）
            add: function(p) {
                // 参数是要添加到现有集群中的数据点。如果数据点落入现有的集群中，则将其添加到该集群，并更新群集的标签。
                // 如果新的点不在现有的集群中，则创建一个新的集群。
                // if passed a graphic, use the GraphicsLayer's add method

                if ( p.declaredClass ) {
                    this.inherited(arguments);
                    return;
                }
                // add the new data to _clusterData so that it's included in clusters
                // when the map level changes
                this._clusterData.push(p);
                var clustered = false;
                // look for an existing cluster for the new point
                for ( var i = 0; i < this._clusters.length; i++ ) {
                    var c = this._clusters[i];
                    if ( this._clusterTest(p, c) ) {
                        // add the point to an existing cluster
                        this._clusterAddPoint(p, c);
                        // update the cluster's geometry
                        this._updateClusterGeometry(c);
                        // update the label
                        this._updateLabel(c);
                        clustered = true;
                        break;
                    }
                }

                if ( ! clustered ) {
                    this._clusterCreate(p);
                    p.attributes.clusterCount = 1;
                    this._showCluster(p);
                }
            },

            clear: function() {
                // Summary:  Remove all clusters and data points.
                this.inherited(arguments);
                this._clusters.length = 0;
            },

            clearSingles: function(singles) {
                // Summary:  Remove graphics that represent individual data points.
                var s = singles || this._singles;
                arrayUtils.forEach(s, function(g) {
                    this.remove(g);
                }, this);
                this._singles.length = 0;
            },

        /**
         * 缩放到一定级别时，显示单点官方代码不论如何缩放将一直显示聚合后的样式，如果想要放大到一定级别显示单个点，可在clusterLayer.js添加一个函数
         * @param e
         */
        showSingles:function()
        {
            var singles = [];
            for ( var i = 0, il = this._clusterData.length; i < il; i++) {
                singles.push(this._clusterData[i]);
            }
            this._addSingles(singles);
        },



        onClick: function(e) {
                // remove any previously showing single features
                /**
                 * 由于每次点击后，均执行this.clearSingles(this._singles);当放大到显示单点时会带来很多不便，所以考虑要执行清除单点时先进行缩放等级判断。
                 */
                if(map.getZoom()<14)
                {
                    this.clearSingles(this._singles);
                }

                // find single graphics that make up the cluster that was clicked
                // would be nice to use filter but performance tanks with large arrays in IE
                var singles = [];
                for ( var i = 0, il = this._clusterData.length; i < il; i++) {
                    if ( e.graphic.attributes.clusterId == this._clusterData[i].attributes.clusterId ) {
                        singles.push(this._clusterData[i]);
                    }
                }
                if ( singles.length > this._maxSingles ) {
                    alert("注意：聚类超出 " + this._maxSingles + " 个点，请缩放图层。");
                    return;
                } else {
                    // stop the click from bubbling to the map
                    e.stopPropagation();
                    this._map.infoWindow.show(e.graphic.geometry);
                    this._addSingles(singles);
                }
            },

            // 聚类方法入口
            _clusterGraphics: function() {
                // first time through, loop through the points
                for ( var j = 0, jl = this._clusterData.length; j < jl; j++ ) {
                    // see if the current feature should be added to a cluster
                    var point = this._clusterData[j];
                    var clustered = false;
                    var numClusters = this._clusters.length;
                    for ( var i = 0; i < this._clusters.length; i++ ) {
                        var c = this._clusters[i];
                        if ( this._clusterTest(point, c) ) {
                            this._clusterAddPoint(point, c);
                            clustered = true;
                            break;
                        }
                    }
                    if ( ! clustered ) {
                        this._clusterCreate(point);
                    }
                }
                this._showAllClusters();
            },

            _clusterTest: function(p, cluster) {
                //点与聚类点之间的距离
                var distance = (
                    Math.sqrt(
                        Math.pow((cluster.x - p.x), 2) + Math.pow((cluster.y - p.y), 2)
                        ) / this._clusterResolution
                    );
                return (distance <= this._clusterTolerance);
            },

            // points passed to clusterAddPoint should be included
            // in an existing cluster
            // also give the point an attribute called clusterId
            // that corresponds to its cluster
            _clusterAddPoint: function(p, cluster) {
                // average in the new point to the cluster geometry
                var count, x, y;
                count = cluster.attributes.clusterCount;
                x = (p.x + (cluster.x * count)) / (count + 1);
                y = (p.y + (cluster.y * count)) / (count + 1);
                cluster.x = x;
                cluster.y = y;

                // build an extent that includes all points in a cluster
                // extents are for debug/testing only...not used by the layer
                if ( p.x < cluster.attributes.extent[0] ) {
                    cluster.attributes.extent[0] = p.x;
                } else if ( p.x > cluster.attributes.extent[2] ) {
                    cluster.attributes.extent[2] = p.x;
                }
                if ( p.y < cluster.attributes.extent[1] ) {
                    cluster.attributes.extent[1] = p.y;
                } else if ( p.y > cluster.attributes.extent[3] ) {
                    cluster.attributes.extent[3] = p.y;
                }

                // increment the count
                cluster.attributes.clusterCount++;
                // attributes might not exist
                if ( ! p.hasOwnProperty("attributes") ) {
                    p.attributes = {};
                }
                // give the graphic a cluster id
                p.attributes.clusterId = cluster.attributes.clusterId;
            },

            // point passed to clusterCreate isn't within the
            // clustering distance specified for the layer so
            // create a new cluster for it
            _clusterCreate: function(p) {
                var clusterId = this._clusters.length + 1;
                // console.log("cluster create, id is: ", clusterId);
                // p.attributes might be undefined
                if ( ! p.attributes ) {
                    p.attributes = {};
                }
                p.attributes.clusterId = clusterId;
                // create the cluster
                var cluster = {
                    "x": p.x,
                    "y": p.y,
                    "attributes" : {
                        "clusterCount": 1,
                        "clusterId": clusterId,
                        "extent": [ p.x, p.y, p.x, p.y ]
                    }
                };
                this._clusters.push(cluster);
            },

            _showAllClusters: function () {
                var tp;
                if (map.spatialReference.isWebMercator()) {
                    //map为WebMercator空间坐标
                    tp="webm";
                }
                else {
                    //map为非WebMercator空间坐标
                    tp="nowebm";
                }
                /**
                 * 此处可以做按地图显示范围控制显示点集
                 * map.getZoom()==?
                 */
                for (var i = 0, il = this._clusters.length; i < il; i++) {
                    var c = this._clusters[i];
                    this._showCluster(c,tp);
                }
            },

            _showCluster: function (c, tp) {
                var point
                if (tp == "webm") {
                    point = new Point(c.x, c.y, this._sr);
                }
                else {
                    var latlng = new Point(parseFloat(c.x), parseFloat(c.y), this._sr);
                    point = webMercatorUtils.webMercatorToGeographic(latlng);
                }

                this.add(
                    new Graphic(
                        point,
                        null,
                        c.attributes
                        )
                    );
                if ( c.attributes.clusterCount == 1 ) {
                    return;
                }

                // 显示聚类点的数值
                var label = new TextSymbol(c.attributes.clusterCount).setColor(new Color(this._clusterLabelColor)).setOffset(0, this._clusterLabelOffset);
                this.add(
                    new Graphic(
                        point,
                        label,
                        c.attributes
                        )
                    );
            },
            _getPoint:function(p,_this){
                if (map.spatialReference.isWebMercator()) {
                    return  new Point(p.x, p.y, _this._sr);
                }
                else {
                    var latlng = new Point(parseFloat(p.x), parseFloat(p.y), _this._sr);
                    return webMercatorUtils.webMercatorToGeographic(latlng);
                }
            },
        /**
         * 点击聚合符号显示的单个点符号修改
         * 每一个点是一个graphic，根据自己项目的要求，定义单个点的符号。参考https://blog.csdn.net/c17854254215/article/details/81503288
         * _addSingles: function(singles) {
            // add single graphics to the map
            arrayUtils.forEach(singles, function(p) {
                var picSym;
                if(p.attributes.装备类型=="火箭"){
                    picSym = new PictureMarkerSymbol("../../../imgs/domain/hj.png", 28, 18)
                }
                else if(p.attributes.装备类型=="高炮"){
                    picSym = new PictureMarkerSymbol("../../../imgs/domain/gp.png", 28, 24)
                }
                else if(p.attributes.装备类型=="燃烧炉"){
                    picSym = new PictureMarkerSymbol("../../../imgs/domain/rsl.png", 20, 30)
                }
                else{
                    picSym = SimpleMarkerSymbol().setSize(4);
                }
                var g = new Graphic(
                    new Point(p.x, p.y, this._sr),
                    picSym,
                    p.attributes,
                    this._singleTemplate
                );
                this._singles.push(g);
                if ( this._showSingles ) {
                    this.add(g);
                }
            }, this);
            this._map.infoWindow.setFeatures(this._singles);
        }
         * @param singles
         * @private
         */
            _addSingles: function(singles) {
                // add single graphics to the map
                arrayUtils.forEach(singles, function(p) {
                    var g = new Graphic(
                        this._getPoint(p,this),
                        this._singleSym,
                        p.attributes,
                        this._singleTemplate
                        );
                    this._singles.push(g);
                    if ( this._showSingles ) {
                        this.add(g);
                    }
                }, this);
                this._map.infoWindow.setFeatures(this._singles);
            },

            _updateClusterGeometry: function(c) {
                // find the cluster graphic
                var cg = arrayUtils.filter(this.graphics, function(g) {
                    return ! g.symbol &&
                    g.attributes.clusterId == c.attributes.clusterId;
                });
                if ( cg.length == 1 ) {
                    cg[0].geometry.update(c.x, c.y);
                } else {
                    console.log("didn't find exactly one cluster geometry to update: ", cg);
                }
            },

            _updateLabel: function(c) {
                // find the existing label
                console.log(11111);
                var label = arrayUtils.filter(this.graphics, function(g) {
                    return g.symbol &&
                    g.symbol.declaredClass == "esri.symbol.TextSymbol" &&
                    g.attributes.clusterId == c.attributes.clusterId;
                });
                if ( label.length == 1 ) {
                    // console.log("update label...found: ", label);
                    this.remove(label[0]);
                    var newLabel = new TextSymbol(c.attributes.clusterCount)
                    .setColor(new Color(this._clusterLabelColor))
                    .setOffset(0, this._clusterLabelOffset);
                    this.add(
                        new Graphic(
                            //new Point(c.x, c.y, this._sr),
                            this._getPoint(c,this),
                            newLabel,
                            c.attributes
                            )
                        );
                // console.log("updated the label");
                } else {
                    console.log("didn't find exactly one label: ", label);
                }
            },

            // debug only...never called by the layer
            _clusterMeta: function() {
                // print total number of features
                console.log("Total:  ", this._clusterData.length);

                // add up counts and print it
                var count = 0;
                arrayUtils.forEach(this._clusters, function(c) {
                    count += c.attributes.clusterCount;
                });
                console.log("In clusters:  ", count);
            }
        }
        );
    });