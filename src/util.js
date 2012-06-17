var _               = require('underscore'),
    path            = require('path'),
    async           = require('async');

var map             = _.map,
    flatten         = _.flatten,
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

exports.zipObject = function(keys, values) {
    var obj = {};
    var pairs = _.zip(keys,values)
    _.each(pairs, function(pair){
       obj[pair[0]] = pair[1];
    });
    return obj;
};

exports.isNotAKey = function(object) {
    return function(key) {
        return object[key] === undefined;
    }
};

exports.quote = function(str) {
    return "`"+str+"`";
};

exports.padRight = function(str, padString, length) {
    while (str.length < length)
        str = str + padString;
    return str;
};

exports.arrayify = function(input) {
    if(_.isArray(input)) {
        return input;
    } else if(input === undefined || input === null) {
        return [];
    } else {
        return [input];
    }
};

exports.of = function(dict, fn) {
    return function(key) {
        return fn(dict[key]);
    };
};

exports.are = function(prop) {
    return function(obj) {
        return obj[prop] === true;
    };
};

exports.prop = function(prop) {
    return function(obj) {
        return obj[prop];
    };
};

exports.curryWaterfallCB = function(cb) {
    return function(result) {
        cb(null, result);
    };
};
