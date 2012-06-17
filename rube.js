#!/usr/bin/env node
var _       = require('underscore'),
    f_      = require('f_underscore'),
    fs      = require('fs'),
    async   = require('async'),
    util    = require('util'),
    glob    = require('glob'),
    events  = require('events'),
    optimist= require('optimist');

var rubefile = JSON.parse(fs.readFileSync('Rubefile.json', 'utf8').replace(/\#.*$/mg,''));

var rpad = function(str, padString, length) {
    while (str.length < length)
        str = str + padString;
    return str;
}

var rubefileToWorkOrder = function(rubefile, task, cb) {
    // Helper functions
    var curry,
        curryWaterfallCB;


    // Setup curry alias function
    curry = async.apply;

    // Commonly used curry application
    curryWaterfallCB = function(cb) {
        return function(result) {
            cb(null, result);
        }
    };

    // Processing Functions
    var normalizeInputs,
        globInputs,
        normalizeTasks,
        populateOutputs,
        populateOutputsRecur,
        generateWorkOrder;

    // Step 0 normalize rubefile tasks
    normalizeInputs = function(taskDefn, cb) {
        // Setup _inputs
        if(_.isArray(taskDefn.input)) {
            taskDefn._inputs = taskDefn.input;
        } else if(_.isString(taskDefn.input) || _.isObject(taskDefn.input)) {
            taskDefn._inputs = [taskDefn.input];
        } else {
            taskDefn._inputs = [];
        }
        cb(null, taskDefn);
    };

    // Glob inputs
    globInputs = function(taskDefn, cb) {
        async.map(
            taskDefn._inputs,
            globInputs.one,
            function(err, inputs) {
                taskDefn._inputs = _.flatten(inputs);
                // TODO: POST
                if(taskDefn._inputs.length > 0 && _.all(taskDefn._inputs, _.isString)) {
                    var regexStr = taskDefn.input.replace(/\*/,'([^\/]*)'),
                        regex    = new RegExp(regexStr);
                    taskDefn._outputs = _.map(taskDefn._inputs, function(input){
                        return input.replace(regex, taskDefn.output);
                    });
                    taskDefn._processingComplete = true;
                } else {
                    taskDefn._processingComplete = false;
                }
                cb(err, taskDefn);
            }
        );
    };
    globInputs.one = function(input, cb) {
        if(_.isString(input) && input.search(/\*/) >= 0) {
            glob(input, function(err, files) {
                cb(err, files);
            });
        } else {
            console.log(input);
            cb(null, input);
        }
    };

    normalizeTasks = function(rubefile, cb) {
        var tasks = _.map(rubefile, function(taskDefn, task) {
            taskDefn.task = task;
            return taskDefn;
        });
        async.map(
            tasks,
            normalizeTasks.one,
            cb
        );
    };
    normalizeTasks.one = function(taskDefn, cb) {
        async.waterfall(
            [
                curry(normalizeInputs, taskDefn),
                globInputs,
                curryWaterfallCB(cb)
            ],
            cb
        );
    };

    var zipObject = function(keys, values) {
        var obj = {};
        var pairs = _.zip(keys,values)
        _.each(pairs, function(pair){
           obj[pair[0]] = pair[1];
        });
        return obj;
    };

    populateOutputs = function(rubefile, cb) {
        var tasks = _.pluck(rubefile,'task');
        rubefile = zipObject(tasks, rubefile);
        populateOutputsRecur(tasks, rubefile, cb);
    };
    populateOutputsRecur = function(toProcess, rubefile, cb) {
        var removed = [];
        _.each(toProcess, function(task) {
            var taskDefn = rubefile[task];
            if(taskDefn._processingComplete) {
                removed.push(task);
            } else {
                taskDefn._inputs = 
                _.map(
                    taskDefn._inputs,
                    function(input) {
                        if(_.isObject(input)) {
                            var inputKeys = _.keys(input),
                                inputTasks;
                            switch(inputKeys[0]) {
                                case "task":
                                    inputTasks = input.task;
                                    break;
                                case "tasks":
                                    inputTasks = input.tasks;
                                    break;
                                case "outputs":
                                    inputTasks = input.outputs;
                                    break;
                                default:
                                    throw "TODO: useful error message."
                            }
                            inputTasks = _.isArray(inputTasks) ? inputTasks : [inputTasks];
                            if(
                                _.all(
                                    inputTasks,
                                    function(inputTask) {
                                        return rubefile[inputTask]._processingComplete;
                                    })
                            ) {
                                return _.map(inputTasks, function(inputTask) {
                                    return rubefile[inputTask]._outputs;
                                });
                            }
                        } 
                        // Else return input
                        return input;
                    }
                );
                taskDefn._inputs = _.flatten(taskDefn._inputs);
                if(_.all(taskDefn._inputs, _.isString)) {
                    if(taskDefn.output) {
                        if(taskDefn.output.search(/\$/) >= 0) {
                        } else {
                            if(_.isArray(taskDefn.outputs)) {
                                taskDefn._outputs = taskDefn.output;
                            } else {
                                taskDefn._outputs = [taskDefn.output];
                            }
                        }
                    }
                    taskDefn._processingComplete = true;
                    removed.push(task);
                }
            }
        });

        toProcess = _.without(toProcess, removed);

        if(removed.length > 0) {
            populateOutputsRecur(toProcess, rubefile, cb);
        } else {
            if(toProcess.length === 0) {
                cb(null, rubefile);
            } else {
                var cycle = toProcess.join(", ");
                throw "Tasks cannot create a cycle in Rubefile: " + cycle;
            }
        }
    };

    generateWorkOrder = function(rubefile, cb) {
        // The goal here is to flesh out all commands we'll need to execute
        // in order to run.
        var workItems = _.map(rubefile, function(task) {
            if(task.exec) {
                if(task._outputs) {
                    if(task._outputs.length === 1) {
                        // single command
                        return {
                            task:       task.task,
                            input:      task._inputs.length > 1 ? task._inputs : task._inputs[0],
                            output:     task._outputs[0],
                            exec:       task.exec,
                            q:          false
                        };
                    } else {
                        throw "exec tasks result in a single output";
                    }
                } else {
                    return {
                        task:       task.task,
                        input:      task._inputs.length > 1 ? task._inputs : task._inputs[0],
                        output:     { "task": task.task },
                        exec:       task.exec,
                        q:          false
                    };
                }
            } else if(task.multiexec) {
                // multiexec
                if(task._inputs.length !== task._outputs.length) {
                    throw "Multiexec tasks must map inputs to outputs 1:1";
                }
                return _.map( _.zip(task._inputs, task._outputs), function(pair) {
                    return {
                        task:       task.task,
                        input:      pair[0],
                        output:     pair[1],
                        exec:       task.multiexec,
                        q:          false
                    };
                });
            } else {
                return [];
            }
        });

        workItems = _.flatten(workItems);

        workItems = _.map(workItems, function(item) {
            var vars = {};
            vars['input'] = vars['inputs'] = _.isArray(item.input) ? 
                                                item.input.join(' ') : 
                                                item.input;
            vars['inputs,'] = _.isArray(item.input) ? 
                                                item.input.join(',') : 
                                                item.input;
            vars['output'] = item.output;

            var search = '\\$('+_.keys(vars).join('|')+')';
            item.exec = item.exec.replace(new RegExp(search,"g"), function(str,match) {
                return vars[match];
            });
            return item;
        });
        cb(null, workItems);
    };

    // var thread = function(input) {
    //     // Pop off input argument
    //     arguments.shift();
    //     var fn = _.comopose(arguments);
    //     return fn(input);
    // }
    //    var ancestorOutputs = thread( input,
    //                                  curry(pluckReverse),
    //                                  flatten,
    //                                  unique
    //                                );

    var trimToTask = function(task, workOrder, cb) {
        var pruned = _.filter(workOrder, function(item) {
            return item.task === task;
        });
        
        var prune = function(tasks) {
            var ancestorOutputs = _.unique(_.flatten(_.pluck(tasks, 'input')));
            var ancestors = _.filter(workOrder, function(item) {
                return _.indexOf(ancestorOutputs, item.output) >= 0;
            });
            _.each(ancestors, function(item) {
                pruned.push(item);
            });
            if(ancestors.length > 0) {
                prune(ancestors);
            }
        };
        prune(pruned);

        cb(null, pruned);
    };

    async.waterfall(
        [
            curry(normalizeTasks, rubefile),
            populateOutputs,
            generateWorkOrder,
            curry(trimToTask, task),
            curryWaterfallCB(cb)
        ],
        function() {
            console.log("fail");
        }
    );
};

var hasTouched = false;

optimist = optimist
                .usage('Usage: $0 [options] [tasks]')
                .boolean(['v','w'])
                .options('v', {
                    alias:      'verbose',
                    describe:   'print all successful commands run',
                    default:    false
                })
                .options('w', {   
                    alias:      'watch',
                    describe:   'run automatically when files change',
                    default:    false
                })
                .options('p', {
                    alias:      'parallel',
                    describe:   'number of tasks to run in parallel',
                    default:    2
                });

var argv = optimist.argv;

if(argv._.length <= 0) {
    optimist.showHelp();
    var tasks = _.keys(rubefile);
    var tasklen = _.max(tasks, function(task) { return task.length; }).length;
    console.error('Tasks:');
    _.each(tasks, function(task) {
        var description = rubefile[task].description ? rubefile[task].description : '';
        console.error("  " + rpad(task,' ',tasklen) + "  " + description);
    });
} else {
    console.log(argv._);    
    console.log(argv.w);
    console.log(argv.v);
}
process.exit();

async.waterfall(
    [
        async.apply(rubefileToWorkOrder, rubefile, "all"),
        function(workorder, cb) {
            var device = new Device(workorder);
            device.scheduleWork();
            device.on('complete', function() {
                console.log('complete');
                console.log('touching!');
                if(!hasTouched) {
                    device.touch('src/b.coffee');
                    device.touch('onepage.html');
                    device.scheduleWork();
                    hasTouched = true;
                }
            });
        }
    ],
    function(err) {
        console.log(err);
    }
);

var arrayify = function(value) {
    return _.isArray(value) ? value : [value];
}

var Device = function(workorder) {
    var device        = this;
    device.taskStrLen = (_.max(workorder, function(item) { return item.task.length; })).task.length;
    device.workorder  = workorder;
    device.incomplete = _.clone(workorder);
    device.completed  = function(err, item) {
        device.incomplete = _.without(device.incomplete, item);
        device.complete.push(item);
        item.q = false;
        if(err !== null) {
            console.log("ERR " + err);
            // remove all descendent tasks
            // opposite of touch
            var flagFile = function(file,skipped) {
                // if a task generates the file, start there
                // otherwise look for all tasks that use the touched file as an input
                // move these and their dependents to incomplete
                var fileIsInputOrOutput = _.filter(device.incomplete, function(item) {
                    var input = item.input,
                        output = item.output;
                    return(
                        (_.isArray(input) && _.indexOf(input, file) >= 0) ||
                        input === file ||
                        output === file
                    );
                });
                _.each(fileIsInputOrOutput, function(item) {
                    device.complete.push(item);
                    device.incomplete = _.without(device.incomplete, item);
                    skipped.push(item);
                    flagFile(item.output,skipped);
                });
                return skipped;
            };
            var skipped = flagFile(item.output,[]);
            var tasks = _.unique(_.pluck(skipped, 'task'));
            console.log("Skipping dependent tasks: " + tasks.join(', '));
        };
        // after touching a non-fail how do we stop from running tasks which also
        // depend on a fail?
        if(device.incomplete.length === 0) {
            this.emit('complete');
        } else {
            device.scheduleWork();
        }
    };
    device.q          = async.queue(function(item, cb) {
        setTimeout(function() {
            if(item.input === 'lib/b.js') {
                console.log('failed: ' + item.exec);
                device.completed("fail",item);
                cb();
            } else {
                console.log(rpad(item.task,' ',device.taskStrLen) + ' | ' + item.exec);
                device.completed(null, item);
                cb();
            }
        }, 100);
    }, 2);
    device.complete   = [];
    // device.touch = function(file) {
    //     // do something
    //     // cases: source or output file
    //     var inputTasks  = [],
    //         outputTasks = [];
    //     _.each(device.workorder, function(item) {
    //         var inputs = arrayify(item.input);
    //         if(_.indexOf(inputs, file) >= 0) {
    //             inputTasks.push(item);
    //         }
    //         if(_.isEqual(item.output, file)) {
    //             outputTasks.push(item);
    //         }
    //     });
    //     console.log(inputTasks);
    //     console.log(outputTasks);
    // };
};
Device.fn = Device.prototype = new events.EventEmitter;
Device.fn.scheduleWork = function() {
    var incomplete = this.incomplete;

    if(incomplete.length === 0) {
        console.log("complete");
        return;
    }

    var q        = this.q,
        inputs   = _.flatten(_.pluck(incomplete, 'input')),
        outputs  = _.pluck(incomplete, 'output'),
        sources  = _.difference(inputs, outputs);

    var upnext = _.filter(incomplete, function(item) {
        if(item.q === true) {
            return false;
        }
        var inputs;
        if(_.isArray(item.input)) {
            inputs = item.input;
        } else {
            inputs = [item.input];
        }
        return _.all(inputs, function(input) {
            return _.indexOf(sources, input) >= 0;
        });
    });

    if(upnext.length > 0) {
        _.each(upnext, function(item) {
            item.q = true;
            q.push(item);
        });
    } else {
         if(!_.any(incomplete, function(item) { return item.q === true; })) {
            throw "Error processing queue.";
        }
    }
};
Device.fn.touch = function(files) {
    files = arrayify(files);
    console.log(files);

    var device = this;

    var touchFile = function(file) {
        // if a task generates the file, start there
        // otherwise look for all tasks that use the touched file as an input
        // move these and their dependents to incomplete
        var fileIsInputOrOutput = _.filter(device.complete, function(item) {
            var input = item.input,
                output = item.output;
            return(
                (_.isArray(input) && _.indexOf(input, file) >= 0) ||
                input === file ||
                output === file
            );
        });
        _.each(fileIsInputOrOutput, function(item) {
            device.incomplete.push(item);
            device.complete = _.without(device.complete, item);
            touchFile(item.output);
        });
    };

    _.each(files, touchFile);
};
