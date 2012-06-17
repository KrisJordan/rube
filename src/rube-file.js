
// Library imports we depend on.
var _                   = require('underscore'),
    f_                  = require('f_underscore'),
    async               = require('async'),
    glob                = require('glob'),
    rubeUtil            = require('./util'),

// Alias functions we'll use from libraries.
    isString            = _.isString,
    isObject            = _.isObject,
    filter              = _.filter,
    flatten             = _.flatten,
    pluck               = _.pluck,
    map                 = _.map,
    all                 = _.all,
    isString            = _.isString,
    without             = _.without,
    values              = _.values,
    keys                = _.keys,
    compose             = _.compose,
    map_a               = async.map,
    curry               = async.apply,
    waterfall           = async.waterfall,
    isNotAKey           = rubeUtil.isNotAKey,
    quote               = rubeUtil.quote,
    arrayify            = rubeUtil.arrayify,
    curryWaterfallCB    = rubeUtil.curryWaterfallCB,
    of                  = rubeUtil.of,
    are                 = rubeUtil.are,
    prop                = rubeUtil.prop,
    zipObject           = rubeUtil.zipObject,

// Constants

// Forward declarations
    RubeFile,
    parseRubeFileJson;

RubeFile = (function() {
    function RubeFile(rubefile) {
        this._tasks     = parseRubeFileJson(rubefile);
    };

    var proto = RubeFile.prototype;

    proto.target = function(targets) {
        this._targets = targets;
        this._checkTargets();
    };

    proto._checkTargets = function() {
        var badTargets = filter(this._targets, isNotAKey(this._tasks));
        if(badTargets.length > 0) {
            badTargets = map(badTargets, quote);
            if(badTargets.length === 1) {
                throw 'Invalid target ' + badTargets[0];
            } else {
                throw 'Invalid targets ' + badTargets.join(', ');
            }
        }
    };

    proto.tasks = function() {
        return this._tasks;
    };

    // The primary job of `RubeFile` is to transform a Rubefile structure
    // into a set of simpler, explicit instructions a `RubeDevice` can use
    // to run with.
    proto.instructions = function(cb) {
        var tasks = proto._internTaskNames(this._tasks);
        waterfall([
                curry(this._prepareInputs, tasks),
                this._prepareStringOutputs,
                this._populateOutputs,
                // this._generateInstructions,
                // curry(this._trimToTargets, this._targets),
                curryWaterfallCB(cb)
        ]);
    };

    // In a Rubefile a task's name is its key. Let's bring the task's name
    // in as a property of the task object itself and return an array of 
    // tasks rather than an object.
    proto._internTaskNames = function(tasks) {
        return map(tasks, function(task, taskname) {
            task.task = taskname;
            return task;
        });
    };

    // A task's input can be specified in a variety of ways: a string, 
    // a dependency object, or an array of either. Here we are
    // normalizing inputs to an _input property that will always be an
    // array of strings or objects.
    proto._prepareInputs = function(tasks, cb) {
        map_a(tasks, proto._prepareInputs.one, cb);
    };
    proto._prepareInputs.one = function(task, cb) {
        task._input = arrayify(task.input);
        map_a(  task._input,
                proto._prepareInputs.one.glob,
                function(err, input) {
                    console.log(input);
                    task._input = flatten(input);
                    cb(err, task);
                });
    };
    proto._prepareInputs.one.glob = function(input, cb) {
        if(_.isString(input) && input.search(/\*/) >= 0) {
            glob(input, function(err, files) {
                cb(err, files);
            });
        } else {
            cb(null, input);
        }
    };

    // A task whose input contains a wildcard glob match can have
    // its outputs populated automatically by replacing with matches
    // from the glob.
    //
    // TODO: Provide feedback when we cannot populate automatically
    proto._prepareStringOutputs = function(tasks, cb) {
        cb(null, map(tasks, proto._prepareStringOutputs.one));
    };
    proto._prepareStringOutputs.one = function(task) {
        var inputs = task._input;
        if(inputs.length > 0 && all(inputs, isString)) {
            var regexStr = task.input.replace(/\*/,'([^\/]*)'),
                regex    = new RegExp(regexStr);
            task._output = map(inputs, function(input) {
                return input.replace(regex, task.output);
            });
            task._ready = true;
        } else {
            task._ready = false;
        }
        return task;
    };

    proto._populateOutputs = function(tasks, cb) {
        var tasknames   = pluck(tasks, 'task'),
            taskDict     = zipObject(tasknames, tasks);
        proto._populateOutputs.recur(tasknames, taskDict, cb);
    };
    proto._populateOutputs.recur = function(toProcess, taskDict, cb) {
        var removed = [];
        _.each(toProcess, function(taskname) {
            var task = taskDict[taskname];
            if(task._ready) {
                removed.push(taskname);
            } else {
                task._input = flatten(map(task._input, function(input) {
                    if(isObject(input)) {
                        var inputSources = input['output'] || false;
                        if(inputSources === false) {
                            throw "Unexpected input `"+JSON.stringify(input)+
                                  "` for task `"+task.task+"`.";
                        }
                        inputSources = arrayify(inputSources);

                        var prop = function(prop) {
                            return function(obj) {
                                return obj[prop];
                            };
                        };

                        var deref = function(obj) {
                            return function(prop) {
                                return obj[prop];
                            };
                        };

                        var thread = function() {
                            var thruFns = arguments;
                            return function(arg) {
                                var val = arg;
                                for(var i = 0; i < thruFns.length; i++) {
                                    val = thruFns[i](val);
                                }
                                return val;
                            };
                        };

                        if(all(inputSources, thread(deref(taskDict),prop("_ready")))) {
                            return map(inputSources, thread(deref(taskDict),prop('_output')));
                        }
                        
                        // if(all(inputSources, of(taskDict, are("_ready")))) {
                        //     return map(inputSources, of(taskDict, prop('_output')));
                        // }
                    }
                    return input;
                }));

                if(all(task._input, isString)) {
                    task._ready = true;
                    removed.push(taskname);
                }
            }
        });

        if(removed.length > 0) {
            toProcess = without(toProcess, removed);
            proto._populateOutputs.recur(toProcess, taskDict, cb);
        } else {
            if(toProcess.length === 0) {
                cb(null, taskDict);
            } else {
                var cycle = toProcess.join(", ");
                throw "Tasks cannot create a cycle in Rubefile: " + cycle;
            }
        }
    };

    proto._generateInstructions = function(tasks, cb) {
    };

    proto._trimToTargets = function(instructions, cb) {
    };

    return RubeFile;
})();

parseRubeFileJson = function(str) {
    if(isString(str)) {
        try {
            return JSON.parse(str.replace(/\#.*$/mg,''));
        } catch (e) {
            throw "Cannot parse Rubefile.";
        }
    } else if(isObject(str)) {
        return str;
    } else {
        throw "Invalid Rubefile.";
    }
};

exports.RubeFile = RubeFile;
