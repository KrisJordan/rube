var RubeDevice;

RubeDevice = (function() {
    function RubeDevice(instructions) {
        this.instructions = instructions;
    };

    RubeDevice.prototype.run = function(cb) {
        if(cb !== undefined) {
            cb(null, []);
        }
    };

    return RubeDevice;
})();

exports.RubeDevice = RubeDevice;
