var _               = require('underscore'),
    async           = require('async'),
    events          = require('events'),

    waterfall       = async.waterfall,
    queue           = async.queue,
    curry           = async.apply,
    bind            = _.bind,
    defaults        = _.defaults,
    clone           = _.clone,
    EventEmitter    = events.EventEmitter,

    DEFAULTS        = {
        verbose:    false,
        watch:      false,
        dry:        false,
        parallel:   2
    },

    RubeDevice;

RubeDevice = (function() {
    function RubeDevice(rubefile, options) {
        this._rubefile      = rubefile;
        this._options       = defaults(options, DEFAULTS);

        // The Rubefile will generate instructions with commands
        // we'll store in `_instructions` and move between 
        // `_incomplete` and `_complete` as work progresses.
        this._instructions  = [];
        this._incomplete    = [];
        this._complete      = [];

        // Setup our queue runner
        this._q             = queue(this._worker, this._options.parallel);
    };

    var proto = RubeDevice.prototype = new EventEmitter;

    proto.run = function() {
        var rubefile = this._rubefile;
        waterfall([
                bind(rubefile.instructions, rubefile),
                bind(this._initInstructions, this)
            ],
            bind(this._scheduleWork, this)
        );
    };

    proto._initInstructions = function(instructions, cb) {
        console.log(instructions);
        process.exit();
        console.log('init instructions');
        this._instructions  = instructions;
        this._incomplete    = clone(instructions);
        this._complete      = [];
        cb(null, instructions);
    };

    proto._worker = function() {
    };

    proto._scheduleWork = function() {
        console.log('scheudle work');
    };

    proto._touch = function(files) {
    };

    return RubeDevice;
})();

exports.RubeDevice = RubeDevice;
