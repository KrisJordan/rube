var _               = require('underscore'),
    path            = require('path'),
    async           = require('async');

var map             = _.map,
    flatten         = _.flatten
    curry           = async.apply;

exports.permute = function(left, right, iter) {
    return flatten(
                map(left, function(leftItem) {
                    return map(right, curry(iter, leftItem));
                })
            );
};

exports.parentDirs = function(cwd) {
    var dirs    = [],
        atRoot  = false,
        focus   = cwd,
        nextFocus;
    do {
        dirs.push(focus);
        nextFocus = path.dirname(focus);
        if(focus === nextFocus) {
            atRoot = true;
        }
        focus = nextFocus;
    } while( !atRoot );
    return dirs;
};

exports.padRight = function(str, padString, length) {
    while (str.length < length)
        str = str + padString;
    return str;
}
