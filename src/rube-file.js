var RubeFile;

RubeFile = (function() {
    function RubeFile() {
    };

    RubeFile.prototype.tasks = function() {
        return [];
    };

    RubeFile.prototype.instructions = function(tasks, cb) {
        cb(null, []);
    };

    return RubeFile;
})();

exports.RubeFile = RubeFile;
