var async = require("async");

module.exports = function (grunt) {

    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        shell: {
            mongo: {
                command: "mongod --dbpath ./data/db"
            }
        },

        less: {
            development: {
                options: {
                    paths: ["./less"],
                    yuicompress: false
                },
                files: {
                    "./public/css/style.css": "./public/less/style.less"
                }
            }
        },

        autoprefixer: {
            development: {
                browsers: ['last 2 versions', 'ie 9'],
                expand: true,
                flatten: true,
                cascade: true,
                src: 'public/css/*.css',
                dest: 'public/css'
            }
        }
    });

    grunt.loadNpmTasks("grunt-shell");
    grunt.loadNpmTasks("grunt-contrib-less");
    grunt.loadNpmTasks("grunt-autoprefixer");

    grunt.task.registerTask("buildless", "build less", ["less", "autoprefixer"]);

};