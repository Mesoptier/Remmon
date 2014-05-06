#!/bin/env node
var express = require("express"),
    scraper = require("./scraper"),
    mongoose = require("mongoose"),
    async = require("async"),
    params = require("express-params"),
    morgan = require("morgan"),
    bodyParser = require("body-parser");

app = express();

// Config
app.set("views", __dirname + "/views");
app.set("view engine", "ejs");

app.set("port", 3000);
app.set("host", "127.0.0.1");
app.set("mongodb host", "127.0.0.1");
app.set("mongodb port", "27017");
app.set("trakt apikey", process.env.TRAKT_APIKEY);

app.use(morgan("dev"));
app.use(express.static(__dirname + "/public"));
app.use(bodyParser());

params.extend(app);

mongoose.connect("mongodb://" + app.get("mongodb host") + ":" + app.get("mongodb port"));

// Routing
app.get("/", function (req, res) {
    res.render("home");
});

app.post("/search", function (req, res) {
    var query = req.body.query,
        limit = req.body.limit || 10;

    scraper.searchCached(query, limit, function (err, results) {
        res.json(results);
    });
});

app.param("title", /^[a-z0-9\-]+$/);

app.get("/:title", function (req, res, next) {
    var title = req.params.title;

    scraper.findShow(title, function (err, show) {
        if (err) return next(err);
        if (!show) return next();

        if (show.slug != title) {
            // Redirect to the correct slug. (e.g. castle -> castle-2009, or tt1520211 -> the-walking-dead)
            return res.redirect("/" + show.slug);
        }

        var data = show.seasons.filter(function (s) {
            // Filter out null/special seasons
            return s && s.season > 0;
        }).map(function (s) {
            return {
                s: s.season,
                e: s.episodes.filter(function (e) {
                    // Filter out episodes that haven't aired yet
                    return e && e.aired < Date.now();
                }).map(function (e) {
                    return {
                        s: e.season,
                        e: e.episode,
                        t: e.title,
                        r: { t: e.traktRating, i: e.imdbRating }
                    };
                })
            };
        }).filter(function (s) {
            // Filter out seasons with no episodes
            return s.e.length > 0;
        }).sort(function (s1, s2) {
            // Sort seasons in ascending order
            return s1.s - s2.s;
        });

        res.render("show.ejs", {
            show: show,
            data: data
        });
    });
});

app.listen(app.get("port"), app.get("host"));