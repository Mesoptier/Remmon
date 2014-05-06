var mongoose = require("mongoose");

var showSchema = new mongoose.Schema({
    title: String,
    year: Number,
    overview: String,
    network: String,
    genres: [String],
    rating: Number,
    aired: Date,

    slug: { type: String, unique: true },
    imdbId: { type: String, unique: true },
    tvdbId: { type: String, unique: true },

    seasons: [{
        season: Number,
        episodes: [{
            season: Number,
            episode: Number,
            title: String,
            traktRating: Number,
            imdbRating: Number,
            aired: Date
        }]
    }]
});

var Show = exports.Show = mongoose.model("Show", showSchema);