const EnhancedEventEmitter = require('./EnhancedEventEmitter');
const RtcPublishDevice = require('./RtcPublishDevice');
const RtcSubscribeDevice = require('./RtcSubscribeDevice');
const RtcClient = require('./RtcClient');
const SdpTransformer = require('sdp-transform');

class UserInfo extends EnhancedEventEmitter
{
    constructor(roomId, uid) {
        super();
        this._roomId     = roomId;
        this._uid        = uid;
        this._rtcRecvDev = null;
    }

    InitRecvPC() {
        if (this._rtcRecvDev == null) {
            this._rtcRecvDev = new RtcSubscribeDevice();
            this._rtcRecvDev.CreateCameraMedia();
            this._rtcRecvDev.CreatePeerConnection();
        }
    }

    async SubscribeUserStream(rtcClient, midinfos) {
        var sdp;

        this.InitRecvPC();

        for (const mediaInfo of midinfos) {
            this._rtcRecvDev.AddSubscriberMedia(mediaInfo);
        }
        
        try {
            sdp = await this._rtcRecvDev.GetSubscribeSdp();
        } catch (error) {
            console.log("start subscribe error:", error);
            throw error;
        }

        console.log("start subscribe remoteUid:", this._uid, "sdp:", sdp);
        var sdpObj = SdpTransformer.parse(sdp);
        for (const media of sdpObj.media) {
            for (const info of midinfos) {
                if (info.type == media.type) {
                    info.mid = media.mid;
                    break;
                }
            }
        }
        console.log("local midinfos object:", JSON.stringify(midinfos));

        //send subscribe request to server
        var respData;
        try {
            respData = await rtcClient.Subscribe(this._uid, midinfos, sdp);
        } catch (error) {
            console.log("rtc client subscribe error:", error);
            throw error;
        }
        if (respData.code != 0) {
            throw new Error("subscribe error:" + respData.desc);
        }
        console.log("rtc client subscribe response data:", respData);

        var respSdp = respData.sdp;
        var sdpJson = SdpTransformer.parse(respSdp);
        console.log("rtc json sdp:", JSON.stringify(sdpJson));
        this._rtcRecvDev.UpdateRemoteSdp(respSdp);

        var trackList = [];
        for (const mediaInfo of midinfos) {
            var newTrack = await new Promise(async (resolve, reject) => {
                this._rtcRecvDev.on('newTrack', (track) => {
                    console.log("rtc manager rtc receive new track:", track);
                    if (track != null) {
                        resolve(track);
                    } else {
                        reject(track);
                    }
                });
            });
            trackList.push(newTrack);
        }
        console.log("get new track list:", trackList);

        return this._rtcRecvDev.mediaStream;
    }
};

class RoomManager extends EnhancedEventEmitter
{
    constructor(server, roomId, uid) {
        super();
        this._server = server;
        this._roomId = roomId.toString();
        this._uid    = uid.toString();

        this._devInit      = false;
        this._joined       = false;
        this._publish      = false;
        this._rtcSendDev   = null;
        this._client       = null;
        this._users        = new Map();
        this._videoElement = null;
        console.log("room manger construct server:", this._server,
            "roomId:", this._roomId, "uid:", this._uid);
    }

    async createMedia(em)
    {
        if (this._devInit) {
            return;
        }
        try {
            this._rtcSendDev = new RtcPublishDevice();
            await this._rtcSendDev.CreateCameraMedia(em);
            await this._rtcSendDev.CreatePeerConnection();
            this._videoElement = em;
        } catch (error) {
            console.log('create media device error:', error);
            throw error;
        }
        this._devInit = true;
    }


    async Join() {
        var respInfo;
        var url = "ws://" + this._server;
        console.log("start connect: ", url);
        console.log("roomid:", this._roomId, ",", "userId:", this._uid);
        this._client = new RtcClient();
        this._client.on('notification', (info) =>
        {
            this._on_notification(info);
        });
        try {
            respInfo = await this._client.Join(url, this._roomId, this._uid);
        } catch(error) {
            console.log("join error:", error);
            throw error;
        }

        for (var user of respInfo.users) {
            this._insertUser(user.uid);
        }
        console.log("the room has users:", respInfo.users, " in roomId:", this._roomId);
    }

    _on_notification(info) {
        console.log("receive notification information:", info);
        var data   = info.data;
        var method = info.method;
        switch (method) {
            case 'userin':
            {
                this._insertUser(data.uid);
                break;
            }
            case 'userout':
            {
                this._removeUser(data.uid);
                break;
            }
            case 'publish':
            {
                this._handleNewPublisher(data);
                break;
            }
            case 'unpublish':
            {
                this._handleRemovePublisher(data);
            }
            default:
            {
                console.log("receive notification methd:", method);
                return;
            }
        }
    }

    _handleNewPublisher(publishData) {
        var remoteUid = publishData.uid;
        var midinfos  = publishData.publishers;
        console.log("receive new publisher uid:", remoteUid, "midinfos:", midinfos);

        this.emit('newPublish', {remoteUid, midinfos});
        //this.Subscribe(remoteUid, midinfos);
    }

    _handleRemovePublisher(unpublishData) {
        console.log("receive unpublisher:", unpublishData);
    }

    _insertUser(uid) {
        var isExist = this._users.has(uid);
        if (isExist) {
            console.log("the notification uid:", uid, "has already existed.");
            return;
        }
        var newUser = new UserInfo(this._roomId, uid);
        console.log("add new user id:", uid, "in room:", this._roomId);
        this._users.set(uid, newUser);
    }

    _removeUser(uid) {
        var isExist = this._users.has(uid);
        if (!isExist) {
            console.log("the notification uid:", uid, "has not existed");
            return;
        }
        console.log("remove user:", uid, "from room:", this._roomId);
        this._users.delete(uid);
    }

    async Subscribe(remoteUid, midinfos) {
        var sdp;

        var isExist = this._users.has(remoteUid);
        if (!isExist) {
            throw new Error('remote uid:', remoteUid, "doesn't exist");
        }
        var remoteUerInfo = this._users.get(remoteUid);

        remoteUerInfo.InitRecvPC();

        var newMediaStream = await remoteUerInfo.SubscribeUserStream(this._client, midinfos);

        console.log("create remote user:", remoteUid, "media stream:", newMediaStream);

        return newMediaStream;
    }

    async PublishVideoStream()
    {
        if (this._client == null) {
            throw new Error('rtc client is not ready');
        }

        var offSdp;
        var mediaTracks = [];

        console.log("start publishing video stream...");
        var videoTrack = this._rtcSendDev.getVideoTrack();

        if (videoTrack != null) {
            mediaTracks.push(videoTrack);
        } else {
            throw new Error("new video track is not ready");
        }

        try {
            offSdp = await this._rtcSendDev.AddSendMediaTrack(mediaTracks);
            console.log("create video offer:", offSdp);
        } catch (error) {
            console.log('create video offer exception:', error);
            throw error;
        }
        
        var respData;
        try {
            respData = await this._client.Publish(offSdp);
        } catch (error) {
            console.log('client video publish exception:', error);
            throw error;
        }
        console.log('client video publish response:', respData);
    
        await this._rtcSendDev.setSenderRemoteSDP(respData['sdp']);
    }

    async PublishAudioStream()
    {
        if (this._client == null) {
            throw new Error('rtc client is not ready');
        }

        var offSdp;
        var mediaTracks = [];

        console.log("start publishing audio stream...");
        var audioTrack = this._rtcSendDev.getAudioTrack();

        if (audioTrack != null) {
            mediaTracks.push(audioTrack);
        } else {
            throw new Error("new audio track is not ready");
        }

        try {
            offSdp = await this._rtcSendDev.AddSendMediaTrack(mediaTracks);
            console.log("create audio offer:", offSdp);
        } catch (error) {
            console.log('create audio offer exception:', error);
            throw error;
        }
        
        var respData;
        try {
            respData = await this._client.Publish(offSdp);
        } catch (error) {
            console.log('client audio publish exception:', error);
            throw error;
        }
        console.log('client audio publish response:', respData);
    
        await this._rtcSendDev.setSenderRemoteSDP(respData['sdp']);
    }

    async PublishStream()
    {
        if (this._client == null) {
            throw new Error('rtc client is not ready');
        }

        var offSdp;
        var mediaTracks = [];

        console.log("start publishing stream...");
        var videoTrack = this._rtcSendDev.getVideoTrack();
        var audioTrack = this._rtcSendDev.getAudioTrack();

        if (videoTrack != null) {
            mediaTracks.push(videoTrack);
        }
        if (audioTrack != null) {
            mediaTracks.push(audioTrack);
        }
        try {
            offSdp = await this._rtcSendDev.AddSendMediaTrack(mediaTracks);
            console.log("create offer:", offSdp);
        } catch (error) {
            console.log('create offer exception:', error);
            throw error;
        }
        
        var respData;
        try {
            respData = await this._client.Publish(offSdp);
        } catch (error) {
            console.log('client publish exception:', error);
            throw error;
        }
        console.log('client publish response:', respData);
    
        await this._rtcSendDev.setSenderRemoteSDP(respData['sdp']);
    }
    
    async PublishCloseAll() {
        var mediatracks = [];
        try {
            var vtrack = this._rtcSendDev.getVideoTrack();
            var atrack = this._rtcSendDev.getAudioTrack();

            if (vtrack != null) {
                mediatracks.push(vtrack);
            }
            if (atrack != null) {
                mediatracks.push(atrack);
            }

            if (mediatracks.length == 0) {
                throw new Error("there is no media track");
            }
            var mids = await this._rtcSendDev.removeSendMediaTrack(mediatracks);
            console.log("remove mids info:", mids);
            this._RequestPublishClose(mids);
        } catch (error) {
            console.log("unpublish stream error:", error);
            throw error;
        }
    }

    async PublishCloseVideo() {
        var mediatracks = [];
        try {
            var vtrack = this._rtcSendDev.getVideoTrack();

            if (vtrack != null) {
                mediatracks.push(vtrack);
            } else {
                throw new Error("there is no video track");
            }

            var mids = await this._rtcSendDev.removeSendMediaTrack(mediatracks);
            console.log("remove mids info:", mids);
            this._RequestPublishClose(mids);
        } catch (error) {
            console.log("unpublish stream error:", error);
            throw error;
        }
    }

    async PublishCloseAudio() {
        var mediatracks = [];
        try {
            var atrack = this._rtcSendDev.getAudioTrack();

            if (atrack != null) {
                mediatracks.push(atrack);
            } else {
                throw new Error("there is no audio track");
            }

            var mids = await this._rtcSendDev.removeSendMediaTrack(mediatracks);
            console.log("remove mids info:", mids);
            this._RequestPublishClose(mids);
        } catch (error) {
            console.log("unpublish stream error:", error);
            throw error;
        }
    }

    async _RequestPublishClose(mids) {
        if (this._client == null) {
            throw new Error('rtc client is not ready');
        }
        if (this._rtcSendDev == null) {
            throw new Error('rtc device is not ready');
        }
        var respData;
        try {
            respData = await this._client.UnPublish(mids);
        } catch (error) {
            console.log('client unpublish exception:', error);
            throw error;
        }
        console.log('client unpublish response:', respData);
    }
};

module.exports = RoomManager;