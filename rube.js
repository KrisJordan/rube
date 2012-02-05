#!/usr/bin/env node
var _       = require('underscore'),
    fs      = require('fs'),
    async   = require('async'),
    util    = require('util'),
    glob    = require('glob');

var rubefile = JSON.parse(fs.readFileSync('Rubefile.json', 'utf8').replace(/\#.*$/mg,''));

var rubefileToTasks = function(rubefile, cb) {
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
        populateOutputs;


    // Step 0 normalize rubefile tasks
    normalizeInputs = function(taskDefn, cb) {
        // Setup _inputs
        if(_.isString(taskDefn.input) || _.isObject(taskDefn.input)) {
            taskDefn._inputs = [taskDefn.input];
        } else if(_.isArray(taskDefn.input)) {
            taskDefn._inputs = taskDefn.input;
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

    populateOutputs = function(rubefile, cb) {
        cb(null, _.map(rubefile, populateOutputs.one));
    };
    populateOutputs.one = function(taskDefn) {
        if(_.all(taskDefn._inputs, _.isString)) {
            var regexStr = taskDefn.input.replace(/\*/,'([^\/]*)'),
                regex    = new RegExp(regexStr);
            taskDefn._outputs = _.map(taskDefn._inputs, function(input){
                return input.replace(regex, taskDefn.output);
            });
        }
        return taskDefn;
    };

    async.waterfall(
        [
            curry(normalizeTasks, rubefile),
            populateOutputs,
            curryWaterfallCB(cb)
        ],
        curryCB(cb)
    );


    // // Step 1 we process all outputs.
    // var processOutputs = function(toProcess, cb) {
    //     var removed = [];

    //     var expandOutputs = function(task, cb) {
    //         var taskDefn = rubefile[task];
    //         async.forEach(taskDefn._inputs, 
    //     };

    //     async.forEach(toProcess, processOutputs, function(err) {
    //         cb(); 
    //     });

    //     _.each(toProcess, function(task) {
    //         var definition = rubefile[task];
    //         if(_.isObject(definition.input)) {
    //             if(definition.input.outputs) {
    //                 var dependency = definition.input.outputs;
    //                 if(rubefile[dependency]._outputs) {
    //                     // good, use outputs as inputs here
    //                     definition._outputs = [];
    //                     removed.push(task);
    //                 }
    //             } else if(definition.input.task) {
    //                 if(rubefile[definition.input.task]._outputs) {
    //                    definition._outputs = [];
    //                    removed.push(task); 
    //                 }
    //             } else if(definition.input.tasks) {
    //                 if(_.all(definition.input.tasks, function(dependency) {
    //                     return _.isArray(rubefile[dependency]._outputs);
    //                 })) {
    //                     removed.push(task);
    //                 }
    //             } else {
    //                 throw "Input must be file name, task object, or outputs object";
    //             }
    //         } else {
    //             removed.push(task);
    //             // generate outputs with glob. agh means this is now async
    //             definition._outputs = [];
    //         }
    //     });
    //     toProcess = _.without(toProcess, removed);

    //     if(removed.length > 0) {
    //         processOutputs(toProcess);
    //     } else {
    //         if(toProcess.length === 0) {
    //             // base case done
    //         } else {
    //             var cycle = toProcess.join(", ");
    //             throw "Tasks cannot create a cycle in Rubefile: " + cycle;
    //         }
    //     }
    // };
    // processOutputs(_.clone(tasks));

    // // Step 2 we generate the work order.
    // cb(null, _.map(rubefile, function(definition, task) {
    //     // Convert a rubefile task to a workorder task
    //     // There are two scenarios
    //     //  - single input
    //     //  - multi input
    //     
    // }));
};

rubefileToTasks(rubefile, function(err, tasks){
    console.log(util.inspect(tasks, false, 3));
});
