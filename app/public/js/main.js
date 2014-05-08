var remmon = {

    /**
     * Checks if the current browser supports local storage.
     * @returns {boolean}
     * @private
     */
    _supportsLocalStorage: function () {
        try {
            return "localStorage" in window && window["localStorage"] !== null;
        } catch (e) {
            return false;
        }
    },

    /**
     * Debounces a function, taken from underscore.js.
     * @param {Function} func - Function to debounce
     * @param {number} wait - Time func needs to be idle before calling
     * @param {boolean} [immediate=false] - Whether to call on the leading or trailing edge
     * @returns {Function} - The debounced function
     */
    debounce: function (func, wait, immediate) {
        var timeout;
        return function () {
            var context = this, args = arguments;
            var later = function () {
                timeout = null;
                if (!immediate) func.apply(context, args);
            };
            var callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func.apply(context, args);
        };
    },

    /**
     * Gets a value from storage. If the key does not exist, automatically sets it to the default value.
     * @param {string} key - Key of the item in storage
     * @param {*} [value] - Default value
     * @returns {*} - Value in storage, or default value if the key does not exist or if the browser has no
     *  localStorage support.
     */
    get: function (key, value) {
        var _value;

        if (remmon._supportsLocalStorage()) {
            if ((_value = localStorage.getItem(key)) !== null) {
                return _value;
            } else {
                localStorage.setItem(key, value);
            }
        }

        return value;
    },

    /**
     * Sets a value in storage.
     * @param {string} key - Key of the item in storage
     * @param {*} value - New value of the item
     */
    set: function (key, value) {
        if (remmon._supportsLocalStorage()) {
            localStorage.setItem(key, value);
        }
    },

    /**
     * Callback for the search method.
     * @callback remmon~searchCallback
     * @param {array} results - Results of the search
     */

    /**
     * Performs a search.
     * @param {string} query - Query to search with
     * @param {number} limit - Number of items to return
     * @param {remmon~searchCallback} callback - Callback that handles the results
     */
    search: function (query, limit, callback) {
        $.post("/search", { query: query, limit: limit }, function (results) {
            callback(results);
        });
    },

    /**
     * Callback for the reloadShow method.
     * @callback remmon~reloadShowCallback
     * @param {boolean} success - Whether the reload was successful
     */

    /**
     * Reloads a show.
     * @param {string} title - Title of the show to reload (slug / imdb id / tvdb id)
     * @param {remmon~reloadShowCallback} callback - Callback that handles the result
     */
    reloadShow: function (title, callback) {
        $.post("/" + title + "/reload", function (result) {
            callback(result.status == "success");
        });
    },

    /**
     * Class used for graphing ratings.
     * @param selector
     * @param options
     * @param seasons
     * @constructor
     */
    Graph: function (selector, options, seasons) {

        var sources = {"imdb": "i", "trakt": "t"},
            types = ["rating", "trend", "mean"];

        // --- [Defaults] ---
        options.source = options.source || source.keys()[0];
        options.type = options.type || types[0];
        options.margin = { top: 10, right: 0, bottom: 50, left: 0 };

        // --- [Data] ---
        var data = {},
            totalEpisodes = 0;

        Object.keys(sources).forEach(function (key) {
            var source = data[key] = {},
                short = sources[key];

            source.rating = [];
            source.trend = [];
            source.mean = [];

            seasons.forEach(function (s) {
                var e = s.e.map(function (e) {
                    return {
                        s: e.s,
                        e: e.e,
                        t: e.t,
                        r: e.r[short]
                    };
                });

                // Remove episodes without a rating, only for calculating trend line
                var te = e.filter(function (e) {
                    return e.r != undefined;
                });

                // Calculate trend line
                var trend = remmon._trendLine(
                    te.map(function (d) { return d.e; }),
                    te.map(function (d) { return d.r; })
                );

                // Add missing ratings, based on trend line
                e.forEach(function (ee, i) {
                    if (ee.r == undefined) {
                        var r = trend(ee.e) * 0.2,
                            c = 0.2;

                        if (e[i - 1] != undefined && e[i - 1].r != undefined) {
                            r += e[i - 1].r;
                            c++;
                        }

                        if (e[i + 1] != undefined && e[i + 1].r != undefined) {
                            r += e[i + 1].r;
                            c++;
                        }

                        ee.r = r / c;
                    }
                });

                // Rating
                source.rating.push({
                    s: s.s,
                    e: e
                });

                source.trend.push({
                    s: s.s,
                    e: e.map(function (e, i) {
                        return {
                            s: e.s,
                            e: e.e,
                            t: e.t,
                            r: trend(e.e)
                        };
                    })
                });

                // Mean
                var mean = d3.mean(e, function (d) { return d.r; });

                source.mean.push({
                    s: s.s,
                    e: e.map(function (e) {
                        return {
                            s: e.s,
                            e: e.e,
                            t: e.t,
                            r: mean
                        };
                    })
                });
            });

            source.episodes = remmon._mergeSeasons(source.rating);

            totalEpisodes = Math.max(totalEpisodes, source.episodes.length);
        });

        // Base minWidth on totalEpisodes and minEpisodeWidth
        options.minWidth = options.minWidth || (totalEpisodes * options.minEpisodeWidth);

        // Season ranges
        var sdomain = [1], srange = [0];
        seasons.forEach(function (s) {
            sdomain.push(s.s + 1);
            srange.push(srange.reduce(function (p, c) { return c; }) + s.e.length);
        });

        // --- [Scales] ---
        // episode -> x
        var x = d3.scale.linear()
            .domain([0, totalEpisodes + 1]);

        // rating -> y
        var y = d3.scale.linear()
            .domain([0, 10]);

        // season -> episode start
        var se = d3.scale.ordinal()
            .domain(sdomain)
            .range(srange);

        // season, episode -> x
        var ex = function (s, e) {
            return x(se(s) + e);
        };

        var colors = ["#1abc9c", "#9b59b6", "#f1c40f", "#e67e22", "#2ecc71", "#3498db", "#e74c3c"];
        var sc = d3.scale.ordinal()
            .domain(d3.range(0, colors.length))
            .range(colors);

        // --- [Helpers] ---
        var line = d3.svg.line()
            .interpolate("cardinal")
            .x(function (e) { return ex(e.s, e.e); })
            .y(function (e) { return y(e.r); });

        var area = d3.svg.area()
            .interpolate("cardinal")
            .x(function (e) { return ex(e.s, e.e); })
            .y0(function (e) { return y(0); })
            .y1(function (e) { return y(e.r); });

        // --- [Elements] ---
        var svg = d3.select(selector).append("svg")
            .attr("width", 1000)
            .attr("height", 400)
            .attr("preserveAspectRatio", "none");

        var backLinesEnter = svg.selectAll(".back-line")
            .data(d3.range(0, 11))
            .enter().append("line")
            .attr("class", "back-line");

        var dots = svg.selectAll(".dot")
            .data(data[options.source].episodes);

        var dotsEnter = dots
            .enter().append("line")
            .attr("class", "dot")
            .attr("stroke", function (d) { return sc(d.s); });

        var lines = svg.selectAll(".line")
            .data(data[options.source][options.type]);

        var linesEnter = lines
            .enter().append("path")
            .attr("class", "line")
            .style("stroke", function (d, i) { return sc(d.s); });

        var areas = svg.selectAll(".area")
            .data(data[options.source][options.type]);

        var areasEnter = areas
            .enter().append("path")
            .attr("class", "area")
            .style("fill", function (d, i) { return sc(d.s); });

        /**
         * Updates the width and height of the graph, it still needs to be redrawn to see the changes.
         * @param {number} [width] - New width
         * @param {number} [height] - New height
         * @return {boolean} - Whether the size has actually changed
         */
        this.resize = function (width, height) {
            var changed = false;

            if (width != undefined) {
                width = Math.max(width, options.minWidth || 0);

                if (width != options.width) {
                    changed = true;
                }

                svg.attr("width", width);
                options.width = width;
                x.range([options.margin.left, width - options.margin.right]);
            }

            if (height != undefined) {
                height = Math.max(height, options.minHeight || 0);

                if (height != options.height) {
                    changed = true;
                }

                svg.attr("height", height);
                options.height = height;
                y.range([height - options.margin.bottom, options.margin.top]);
            }

            return changed;
        };

        /**
         * Sets the data source.
         * @param {string} source - "imdb" or "trakt"
         */
        this.setSource = function (source) {
            options.source = source;
            this._updateData();
        };

        this.getSource = function () { return options.source; };

        /**
         * Sets the line type.
         * @param {string} type - "rating", "trend" or "mean"
         */
        this.setType = function (type) {
            options.type = type;
            this._updateData();
        };

        this.getType = function () { return options.type; };

        /**
         * Update the data, after setting the data-source or line-type.
         * @private
         */
        this._updateData = function () {
            dots.data(data[options.source].episodes);
            lines.data(data[options.source][options.type]);
            areas.data(data[options.source][options.type]);
        };

        /**
         * Draws the graph.
         * @param {string} [animation] - What animation to perform, if any.
         */
        this.draw = function (animation) {
            backLinesEnter
                .attr("x1", 0)
                .attr("x2", options.width)
                .attr("y1", function (d) { return y(d) })
                .attr("y2", function (d) { return y(d) });

            this._animate(dotsEnter, animation)
                .attr("x1", function (e, i) { return ex(e.s, e.e); })
                .attr("x2", function (e, i) { return ex(e.s, e.e); })
                .attr("y1", function (e) { return y(e.r); })
                .attr("y2", function (e) { return y(e.r); });

            this._animate(linesEnter, animation)
                .attr("d", function (s) { return line(s.e); });

            this._animate(areasEnter, animation)
                .attr("d", function (s) { return area(s.e); });
        };

        this._animate = function (enter, animation) {
            switch (animation) {
                case "initial":
                    var opacity = enter.style("opacity");
                    return enter
                        .style("opacity", 0)
                        .attr("transform", "translate(0, " + (-y(0) * (0.8 - 1)) + ") scale(1, 0.8)")
                        .transition()
                        .delay(100)
                        .duration(600)
                        .ease("back-out")
                        .style("opacity", opacity)
                        .attr("transform", "translate(0, 0) scale(1, 1)");

                case "source-change":
                case "type-change":
                    return enter
                        .transition()
                        .duration(400)
                        .ease("cubic-in-out");

                default:
                    return enter;
            }
        };

        // Call the resize method with the initial width and height
        this.resize(options.width, options.height);
    },

    /**
     * Merge the episodes of multiple seasons into one array.
     * @param {array} seasons
     * @returns {array}
     * @private
     */
    _mergeSeasons: function (seasons) {
        return Array.prototype.concat.apply([], seasons.map(function (s) { return s.e; }))
    },

    /**
     * Calculate the trend line for a collection of points.
     * @param {array} xSeries - X coordinates of the points
     * @param {array} ySeries - Y coordinates of the points
     * @returns {d3.scale.linear} - The trend line as a d3js linear scale
     * @private
     */
    _trendLine: function (xSeries, ySeries) {
        var reduceSumFunc = function (prev, cur) { return prev + cur; };

        var xBar = xSeries.reduce(reduceSumFunc) * 1.0 / xSeries.length;
        var yBar = ySeries.reduce(reduceSumFunc) * 1.0 / ySeries.length;

        var ssXX = xSeries.map(function (d) { return Math.pow(d - xBar, 2); })
            .reduce(reduceSumFunc);

        var ssYY = ySeries.map(function (d) { return Math.pow(d - yBar, 2); })
            .reduce(reduceSumFunc);

        var ssXY = xSeries.map(function (d, i) { return (d - xBar) * (ySeries[i] - yBar); })
            .reduce(reduceSumFunc);

        var slope = ssXY / ssXX;
        var intercept = yBar - (xBar * slope);

        return d3.scale.linear()
            .domain([0, xSeries.length - 1])
            .range([slope + intercept, slope * xSeries.length + intercept]);
    }

};