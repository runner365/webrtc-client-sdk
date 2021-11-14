const EnhancedEventEmitter = require('./EnhancedEventEmitter');

class UserInfo extends EnhancedEventEmitter
{
    constructor({roomId, uid})
    {
        super();

        this._roomId = roomId;
        this._uid    = uid;
        this._mediaStream = null;
    }

    CreateMediaStream()
    {
        if (this._mediaStream == null)
        {
            this._mediaStream = new MediaStream();
        }
        return this._mediaStream;
    }

    GetMediaStream()
    {
        return this._mediaStream;
    }

    GetRoomId()
    {
        return this._roomId;
    }

    GetUserId()
    {
        return this._uid;
    }
};


module.exports = UserInfo;