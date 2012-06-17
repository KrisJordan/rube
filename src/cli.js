/**
 * # rube command line runner 
 *
 * A Rubefile contains a JSON representation of a project's build tasks and
 * other automated procedures.
 *
 * When `rube` is run it looks in the current working directory for a Rubefile.
 * which can be named:
 *
 *  * Rubefile
 *  * Rubefile.json
 *
 * If not found in the current working directory it will search parent 
 * directories recursively.
 *
 * Copyright (c) 2011, Kris Jordan. MIT License.
 * Documentation at http://krisjordan.com/rube
 */

// Let's pull in our dependencies.
var fs              = require('fs'),
    path            = require('path'),
    _               = require('underscore'),
    opt             = require('optimist'),
    rubeUtil        = require('./util'),
    RubeFile        = require('./rube-file').RubeFile,
    RubeDevice      = require('./rube-device').RubeDevice,

// Now let's alias the functions we depend on for convenient access.
    find            = _.find,
    each            = _.each,
    isObject        = _.isObject,
    keys            = _.keys,
    max             = _.max,
    permute         = rubeUtil.permute,
    parentDirs      = rubeUtil.parentDirs,
    padRight        = rubeUtil.padRight,

// Rubefiles have an optional json extension. Maybe in the future there will
// be other valid names, like dot prefixed `.rubefile`. Let's abstract all
// possible file names into a constant array.
    RUBEFILE_NAMES  = [ 'Rubefile', 'Rubefile.json' ],

// Finally, let's forward declare our function names so that we can approach
// implement main in a top-down fashion.
    main,
    findRubeFilePath,
    parseOptions,
    showCommandHelp,
    exitError;

// The ultimate purpose of running this program is to invoke `main` which
// specifies the flow of control for running the `rube` command. Its invocation
// follows the other function definitions and is at the end of this file.
exports.main = main = function() {

    // `rube` requires a Rubefile to run, let's find it.
    var rubefilePath = findRubefilePath(process.cwd(), RUBEFILE_NAMES);
    if(rubefilePath === false) {
        exitError('Could not find Rubefile');
    }

    // Parse command line options using optimist.
    var opt         = parseOptions(),
        argv        = opt.argv,
        options     = {
            verbose:    argv.v,
            watch:      argv.w,
            dry:        argv.d,
            parallel:   argv.p
        },
        targets     = argv._;

    // Instantiate a `RubeFile` with the contents of our `Rubefile`.
    try {
        var rubefileContents = fs.readFileSync(rubefilePath, 'utf8'),
            rubefile         = new RubeFile(rubefileContents);
    } catch(e) {
        exitError(e);
    }

    // If no target tasks are specified, or the targets are invalid
    // we display `rube` help which includes descriptions of the tasks
    // defined in the Rubefile.
    try{
        if(targets.length <= 0) {
            throw("Must specify at least one target task.");
        }
        rubefile.target(targets);
    } catch(e) {
        showCommandHelp(opt, rubefile);
        exitError(e);
    }

    // A `RubeDevice` is constructed from a `RubeFile` definition
    // for targeting specific tasks.
    try {
        (new RubeDevice(rubefile, options)).run();
    } catch(e) {
        exitError(e);
    }

};

// It is nice to be able to run rube from any place within a project's
// structure. So we'll look for the nearest Rubefile starting in our
// current working directory and working our way up.
findRubefilePath = function(cwd, names) { 
    var dirs         = parentDirs(cwd),
        locations    = permute(dirs, names, path.join),
        rubefilePath = find(locations, path.existsSync);
    return rubefilePath !== undefined ? rubefilePath : false;
};

// Using the `optimist` command line parsing package we can easily
// specify options available to us.
parseOptions = function() {
    return opt
            .usage('Usage: rube [options] [tasks]')
            .options('v', {
                alias:      'verbose',
                describe:   'print successful commands run',
                default:    false
            })
            .options('w', {   
                alias:      'watch',
                describe:   'run automatically on file changes',
                default:    false
            })
            .options('d', {
                alias:      'dry',
                describe:   'show commands that will run',
                default:    false
            })
            .boolean(['v','w','d'])
            .options('p', {
                alias:      'parallel',
                describe:   '# of commands to run in parallel',
                default:    2
            });
};

// Running `rube` without any tasks specified results in helpful
// information being displayed including the names and descriptions
// of all of the available tasks in the `Rubefile`.
showCommandHelp = function(optimist,rubefile) {
     // `optimist` will display the help information on usage and flags.
     optimist.showHelp();
     // We'll display the help information on the tasks in the Rubefile.
     var tasks      = rubefile.tasks();
     console.error("Tasks:");
     if(isObject(tasks)) {
         var tasknames  = keys(tasks),
             tasklen    = max(tasknames, function(task) { return task.length; }).length;
         each(tasks, function(task,taskname) {
             var description = task.description ? task.description : '';
             console.error("  " + padRight(taskname,' ',tasklen) + "  " + description);
         });
    } else {
        console.error("  No task definitions found in the Rubefile.");
    }
    console.error("");
};

// There are a multiple points where we need to exit abnormally. The `exitError`
// function handles those cases.
exitError = function(message) {
    console.error("Error: " + message);
    console.error("");
    process.exit(1);
};
