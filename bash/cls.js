/*global module*/
/*global require*/

"use strict";

module.exports = function (args, stdout, stderr, tab) {
    tab.lines = [];
    tab.history = [];
};

module.exports.help = [
    require("sprintf-js").sprintf("%-30s %s", "cls", "clears the screen")
];