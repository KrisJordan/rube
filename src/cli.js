/**
 * # rube command line runner 
 *
 * A Rubefile contains a JSON representation of a project's common tasks.
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
 */

// Pull in dependencies.
var fs              = require('fs'),
    path            = require('path'),
    _               = require('underscore'),
    opt             = require('optimist'),
    rubeUtil        = require('./util'),

// Import functions for convenient access.
    find            = _.find,
    each            = _.each,
    permute         = rubeUtil.permute,
    parentDirs      = rubeUtil.parentDirs,
    padRight        = rubeUtil.padRight,

// Define our constants.
    RUBEFILE_NAMES  = [ 'Rubefile', 'Rubefile.json' ],

// Forward declare function names
    main,
    exit,
    parseOptions,
    showTaskDescriptions,
    findRubeFilePath;

// The ultimate purpose of running this program is to invoke `main` which
// specifies the flow of control for running the `rube` command. Its invocation
// follows the other function definitions and is at the end of this file.
main = function() {

    // `rube` requires a Rubefile to run, let's find it.
    var rubefilePath = findRubefilePath(process.cwd(), RUBEFILE_NAMES);
    if(rubefilePath === false) {
        exit('Could not find Rubefile');
    }

    // Instantiate a `RubeFile` with the contents of our `Rubefile`.
    try {
        var rubefileContents = fs.readFileSync(rubefilePath, 'utf8'),
            rubefile         = new RubeFile(rubefileContents);
    } catch(e) {
        exit(e);
    }
    
    // Parse command line options
    var opt         = parseOptions(),
        argv        = opt.argv,
        options     = {
            verbose:    argv.v,
            watch:      argv.w,
            parallel:   argv.p
        },
        tasks       = argv._;

    // If no tasks are specified, we display the command's help which
    // includes descriptions of the tasks defined in the Rubefile.
    if(tasks.length <= 0) {
        showCommandHelp(opt, rubefile);
        exit("Must specify at least one task.");
    }

    // A `RubeDevice` is constructed from the `RubeFile`'s instructions
    // for targeting specific tasks.
    try {
        (new RubeDevice(rubefile.instructions(tasks), options)).run();
    } catch(e) {
        exit(e);
    }
};

showCommandHelp = function(optimist,rubefile) {
     optimist.showHelp();
     var tasks = _.keys(rubefile.tasks());
     var tasklen = _.max(tasks, function(task) { return task.length; }).length;
     each(tasks, function(task) {
         var description = rubefile.describe(task) ? rubefile.describe(task) : '';
         console.error("  " + padRight(task,' ',tasklen) + "  " + description);
     });
};

parseOptions = function() {
    return opt
            .usage('Usage: rube [options] [tasks]')
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
};

exit = function(message) {
    console.error(e);
    process.exit();
};

findRubefilePath = function(cwd, names) { 
    var dirs         = parentDirs(cwd),
        locations    = permute(dirs, names, path.join);
        rubefilePath = find(locations, path.existsSync);
    return rubefilePath !== undefined ? rubefilePath : false;
};

// Execute rube
main();
