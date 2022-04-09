const EnhancedEventEmitter = require('./EnhancedEventEmitter');
const MediaStatsInfo = require('./MediaStatsInfo');

class UserInfo extends EnhancedEventEmitter
{
    constructor({roomId, uid, userType})
    {
        super();

        this._roomId = roomId;
        this._uid    = uid;
        this._userType = userType;
        this._mediaStream = null;

        this._pcId = ''
        this._publishers;

        this._recvVideoStats = new MediaStatsInfo();
        this._recvAudioStats = new MediaStatsInfo();
    }

    RecvVideoStats() {
        return this._recvVideoStats;
    }

    RecvAudioStats() {
        return this._recvAudioStats;
    }

    SetPcId(pcid) {
        this._pcId = pcid;
    }

    GetPcid() {
        return this._pcId;
    }

    SetPublishers(publishers) {
        this._publishers = publishers;
    }

    GetPublishers() {
        return this._publishers;
    }
    
    CreateMediaStream()
    {
        if (this._mediaStream == null)
        {
            this._mediaStream = new MediaStream();
        }
        return this._mediaStream;
    }

    CloseMediaStream()
    {
        this._mediaStream = null;
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