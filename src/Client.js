const EnhancedEventEmitter = require('./EnhancedEventEmitter');
const StreamManager = require('./StreamManager');
const SdpTransformer = require('sdp-transform');


class Client extends EnhancedEventEmitter
{
    constructor({server, roomId, uid}) {
        super();
        this._server = null;
        this._roomId = null;
        this._uid    = null;
        this.remoteUsers = new Map();

        this._cameraStream = null;
        this._screenStream = null;
    }

    Init({server, roomId, uid})
    {
        this._server = server;
        this._roomId = roomId.toString();
        this._uid    = uid.toString();
        console.log("room manger construct server:", this._server,
            "roomId:", this._roomId, "uid:", this._uid);
    }

    async OpenCamera()
    {
        if (this._cameraStream)
        {
            throw Error("the camera is opened");
        }

        try
        {
            this._cameraStream = new StreamManager({mediaType:'camera'});
            return await this._cameraStream.Open();
        } catch (error) {
            throw new Error("create stream error:", error);
        }
    }
};

module.exports = Client;