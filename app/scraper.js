var request = require("request"),
    memoize = require("memoizee"),
    models = require("./models"),
    cheerio = require("cheerio");

var Show = models.Show;

var TRAKT_BASE = "http://api.trakt.tv/";

var scraper = module.exports = {};

scraper._trakt = function (method, pathParams, queryParams, callback) {
    // Allow optional pathParams
    if (typeof pathParams !== "string") {
        callback = queryParams;
        queryParams = pathParams;
        pathParams = null;
    }

    // Allow optional queryParams
    if (Object.prototype.toString.call(queryParams) === "[object Function]") {
        callback = queryParams;
        queryParams = null;
    }

    // Request away!
    request({
        uri: TRAKT_BASE + method + ".json/" + app.get("trakt apikey") + (pathParams ? "/" + pathParams : ""),
        qs: queryParams,
        json: true
    }, function (err, res, body) {
        if (err) return callback(err);

        return callback(null, body);
    });
};

scraper._getTraktSlug = function (url) {
    return url.match(/([^\/]+)\/?$/)[1];
};

scraper.search = function (query, limit, callback) {
    scraper._trakt("search/shows", {
        query: query,
        limit: limit
    }, function (err, results) {
        if (err) return callback(err);

        results = results.map(function (result) {
            return {
                title: result.title,
                year: result.year,
                slug: scraper._getTraktSlug(result.url)
            };
        });

        var slugs = [];
        results = results.filter(function (result) {
            if (slugs.indexOf(result.slug) == -1) {
                slugs.push(result.slug);
                return true;
            } else {
                return false;
            }
        });

        return callback(null, results);
    });
};

scraper.searchCached = memoize(scraper.search, {
    length: 2,
    async: true,
    maxAge: 1000 * 60 * 24,
    resolvers: [
        function (query) { return query.toLowerCase().trim(); },
        Number
    ]
});

scraper.findShow = function (title, callback) {
    Show.findOne({ $or: [
        { slug: title },
        { imdbId: title },
        { tvdbId: title }
    ] }, function (err, show) {
        if (err) return callback(err);

        if (show == null)
            return scraper.updateShow(title, callback);

        return callback(null, show);
    });
};

scraper.updateShow = function (title, callback) {
    scraper._trakt("show/summary", title + "/true", function (err, data) {
        if (err) return callback(err);

        var update = {
            title: data.title,
            year: data.year,
            overview: data.overview,
            network: data.network,
            genres: data.genres,
            rating: data.ratings.percentage / 10,
            aired: new Date(data.first_aired * 1000),

            slug: scraper._getTraktSlug(data.url),
            imdbId: data.imdb_id || null,
            tvdbId: data.tvdb_id || null,

            updatedAt: new Date
        };

        update.seasons = [];

        data.seasons.forEach(function (season) {
            update.seasons[season.season] = {
                season: season.season,
                episodes: []
            };

            season.episodes.forEach(function (episode) {
                update.seasons[season.season].episodes[episode.episode] = {
                    season: episode.season,
                    episode: episode.episode,
                    title: episode.title,
                    traktRating: episode.ratings.percentage / 10,
                    aired: new Date(episode.first_aired * 1000)
                };
            });
        });

        scraper._updateShowImdb(update, function (err, update) {
            Show.findOneAndUpdate({ $or: [
                { slug: update.slug },
                { imdbId: update.imdbId },
                { tvdbId: update.tvdbId }
            ] }, update, { upsert: true }, function (err, show) {
                if (err) return callback(err);

                return callback(null, show);
            });
        });

    });
};

scraper._updateShowImdb = function (update, callback) {
    if (!update.imdbId) return callback(null, update);

    var req = request({
        url: "http://www.imdb.com/title/" + update.imdbId + "/epdate"
    }, function (err, res, body) {
        if (err) return calback(err);

        var cols = { number: 0, name: 1, rating: 2 },
            $ = cheerio.load(body);

        $(".epdate table").first().find("tr").each(function (i, row) {
            var cells = $(row).find("td"),
                numbers = cells.eq(cols.number).text().match(/(\d+)\W(\d+)/);

            // Skip rows with invalid numbers field
            if (numbers == null) return;

            var season = parseInt(numbers[1]),
                episode = parseInt(numbers[2]),
                rating = parseFloat(cells.eq(cols.rating).text());

            if (update.seasons[season] && update.seasons[season].episodes[episode]) {
                update.seasons[season].episodes[episode].imdbRating = rating;
            }
        });

        callback(null, update);
    });

    console.log("-", "GET", req.uri.href);
};