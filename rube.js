#!/usr/bin/env node
var _       = require('underscore'),
    fs      = require('fs'),
    async   = require('async'),
    util    = require('util'),
    glob    = require('glob'),
    events  = require('events');

var rubefile = JSON.parse(fs.readFileSync('Rubefile.json', 'utf8').replace(/\#.*$/mg,''));

var rubefileToWorkOrder = function(rubefile, cb) {
    // Helper functions
    var curry,
        curryCB,
        curryWaterfallCB;


    // Setup curry alias function
    curry = async.apply;

    // Commonly used curry application
    curryCB = function(cb) {
        return function(err, data) {
            cb(err, data);
        }
    };

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
            throw "`input` required for task definitions";
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
                if(_.all(taskDefn._inputs, _.isString)) {
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
            curryCB(cb)
        );
    };
    normalizeTasks.one = function(taskDefn, cb) {
        async.waterfall(
            [
                curry(normalizeInputs, taskDefn),
                globInputs,
                curryWaterfallCB(cb)
            ],
            curryCB(cb)
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
                                        console.log('here');
                                        console.log(inputTasks);
                                        console.log(inputTask);
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
                console.log(util.inspect(rubefile,false,4));
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

    async.waterfall(
        [
            curry(normalizeTasks, rubefile),
            populateOutputs,
            generateWorkOrder,
            curryWaterfallCB(cb)
        ],
        curryCB(cb)
    );
};

rubefileToWorkOrder(rubefile, function(err, tasks){
    console.log(util.inspect(tasks, false, 4));
});

async.waterfall(
    [
        async.apply(rubefileToWorkOrder, rubefile),
        function(workorder, cb) {
            var device = new Device(workorder);
            device.scheduleWork();
            device.on('complete', function() {
                console.log('complete');
                device.touch('lib/b.js');
            });
        }// ,
        // function(workorder) {
        //     console.log(workorder);
        // }
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
    device.workorder  = workorder;
    device.incomplete = _.clone(workorder);
    device.completed  = function(err, item) {
        device.incomplete = _.without(device.incomplete, item);
        device.complete.push(item);
        item.q = false;
        
        if(device.incomplete.length === 0) {
            this.emit('complete');
        } else {
            device.scheduleWork();
        }
    };
    device.q          = async.queue(function(item, cb) {
        console.log('begin:    ' + item.exec);
        setTimeout(function() {
            console.log('complete: ' + item.exec);
            device.completed(null, item);
            cb();
        }, 100);
    }, 4);
    device.complete   = [];
    device.touch = function(file) {
        // do something
        // cases: source or output file
        var inputTasks  = [],
            outputTasks = [];
        _.each(device.workorder, function(item) {
            var inputs = arrayify(item.input);
            if(_.indexOf(inputs, file) >= 0) {
                inputTasks.push(item);
            }
            if(_.isEqual(item.output, file)) {
                outputTasks.push(item);
            }
        });
        console.log(inputTasks);
        console.log(outputTasks);
    };
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
