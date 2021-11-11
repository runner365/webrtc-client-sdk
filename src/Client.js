const EnhancedEventEmitter = require('./EnhancedEventEmitter');
const StreamManager = require('./StreamManager');
const SdpTransformer = require('sdp-transform');
const wsClient = require('./WebSocketClient');
const UserInfo = require('./UserInfo');
const PCManager = require('./PCManager')

class Client extends EnhancedEventEmitter
{
    constructor()
    {
        super();
        this._remoteUsers = new Map();//uid, UserInfo

        this._cameraStream = null;
        this._screenStream = null;

        this._closed = true;
        this._connected = true;
        this._sendPC = new PCManager();
        this._sendPC.CreatePeerConnection('send');
        this._recvPC = new PCManager();
        this._recvPC.CreatePeerConnection('recv');

        this._cameraVideoMid = 0;
        this._cameraAudioMid = 0;
        this._publishCamera  = false;
    }

    async OpenCamera()
    {
        if (this._cameraStream)
        {
            throw Error("the camera is opened");
        }

        try
        {
            this._cameraStream = new StreamManager();
            return await this._cameraStream.Open('camera');
        } catch (error) {
            console.log("create stream error:", error);
            throw new Error("create stream error:" + error);
        }
    }

    /*
    return: {"users":[{"uid":"11111"}, {"uid":"22222"}]}
    */
    async Join({serverHost, roomId, uid})
    {
        this._server = serverHost;
        this._roomId = roomId;
        this._uid    = uid;

        this.ws = new wsClient();

        this.url = 'ws://' + serverHost + '/?' + 'roomid=' + roomId + '&uid=' + uid;
        this.ws.Connect(this.url);

        await new Promise((resolve, reject) => {
            this._wsRegistEvent(resolve, reject);
        });

        let data = {
            'roomId': roomId,
            'uid': uid
        };
        console.log("ws is connected, starting joining server:", this.url, "data:", data);
        let respData = null;
        try {
            respData = await this.ws.request('join', data);
        } catch (error) {
            console.log("join exception error:", error);
            throw error;
        }

        let users = respData['users'];
        for (const user of users)
        {
            let uid = user['uid'];
            let userinfo = new UserInfo({roomId: this._roomId, uid: uid});

            this._remoteUsers.set(uid, userinfo);
        }
        console.log("join response:", JSON.stringify(respData));

        return respData;
    }

    async PublishCamera({videoEnable, audioEnable})
    {
        if (!this._connected)
        {
            throw new Error('websocket is not ready');
        }

        if (!this._cameraStream)
        {
            throw new Error('camera does not init');
        }

        if (!videoEnable && !audioEnable)
        {
            throw new Error('video and audio are not enable');
        }

        if (this._publishCamera)
        {
            throw new Error('the camera has been published');
        }

        let mediaTracks = [];
        if (videoEnable)
        {
            mediaTracks.push(this._cameraStream.GetVideoTrack());
        }
        if (audioEnable)
        {
            mediaTracks.push(this._cameraStream.GetAudioTrack());
        }

        let offerInfo = await this._sendPC.AddSendMediaTrack(mediaTracks);
        for (const info of offerInfo.mids)
        {
            if (info.type == 'video')
            {
                this._cameraVideoMid = info.mid;
            }
            else if (info.type == 'audio')
            {
                this._cameraAudioMid = info.mid;
            }
            else
            {
                console.log("unkown media type:", info.type);
                throw new Error("unkown media type: " + info.type);
            }
        }
        let data = {
            'roomId': this._roomId,
            'uid': this._uid,
            'sdp' : offerInfo.offSdp
        }
        let respData;

        try {
            respData = await this.ws.request('publish', data);
        } catch (error) {
            console.log("send publish message exception:", error)
            throw error
        }
        console.log("Publish response message:", respData);

        let answerSdp = respData['sdp'];

        await this._sendPC.SetSendAnswerSdp(answerSdp);

        this._publishCamera  = true;
        return;
    }

    async UnPublishCamera({videoDisable, audioDisable})
    {
        if (!this._connected)
        {
            throw new Error('websocket is not ready');
        }

        if (!this._cameraStream)
        {
            throw new Error('camera does not init');
        }

        if (!videoDisable && !audioDisable)
        {
            throw new Error('video and audio are not disable');
        }

        if (!this._publishCamera)
        {
            throw new Error('the camera has not been published');
        }

        let removeMids = [];
        let requestMids = [];
        if (videoDisable)
        {
            removeMids.push(this._cameraVideoMid);
            requestMids.push({
                'mid': this._cameraVideoMid,
                'type': "video"
            });
        }
        if (audioDisable)
        {
            removeMids.push(this._cameraAudioMid);
            requestMids.push({
                'mid': this._cameraAudioMid,
                'type': "audio"
            });
        }

        this._sendPC.removeSendTrack(removeMids);

        //send unpublish request
        let data = {
            'roomId': this._roomId,
            'uid': this._uid,
            'mids' : requestMids
        }

        let respData;
        try {
            console.log("unpublish request: ", data);
            respData = await this.ws.request('unpublish', data);
        } catch (error) {
            console.log("send unpublish message exception:", error)
            throw error
        }
        console.log("UnPublish response message:", respData);

        this._publishCamera  = false;
        return respData;
    }

    _wsRegistEvent(resolve, reject)
    {
        this.ws.on('open', () =>
        {
            this._connected = true;
            this._closed = false;
            resolve(0);
        });
        
        this.ws.on('close', () => 
        {
            this._connected = false;
            this._closed = true;
            reject(new Error('protoo close'));
        });

        this.ws.on('error', (err) =>
        {
            this._connected = false;
            this._closed = true;
            reject(err);
        });

        this.ws.on('notification', (info) =>
        {
            try {
                console.log("notification info:", info);
                if (info.method == 'userin')
                {
                    let remoteUid = info.data['uid'];
                    let remoteUser = new UserInfo({roomId: this._roomId, uid:remoteUid});
                    this._remoteUsers.set(uid, remoteUser);
                }
                this.safeEmit(info.method, info.data);
            } catch (error) {
                console.log("notify error:", error);
            }
            
        });
    }

    /*
    input: 
        mideinfos: [{mid: 0, pid: 'xxxxx', ssrc: xxxxx, type: 'video'}]
    */
    async Subscribe(remoteUid, midinfos)
    {
        if (!this._connected)
        {
            throw new Error('websocket is not ready');
        }

        let hasUid = this._remoteUsers.has(remoteUid);
        if (!hasUid)
        {
            throw new Error('remote uid has not exist:' + remoteUid);
        }
        let remoteUser = this._remoteUsers.get(remoteUid);

        console.log("start subscribe remote user:", remoteUser, "midinfo:", midinfos);

        for (const info of midinfos) {
            this._recvPC.AddSubscriberMedia(info.type);
        }

        let offerSdp = await this._recvPC.GetSubscribeOfferSdp();
        let sdpObj = SdpTransformer.parse(offerSdp);
        let baseIndex = sdpObj.media.length - midinfos.length;
        let maxIndex = sdpObj.media.length;
        for (let index = baseIndex; index < maxIndex; index++) {
            let media = sdpObj.media[index];
            for (let info of midinfos) {
                if (info.type == media.type) {
                    info.localMid = media.mid;//set localMid for local peerconnection
                    break;
                }
            }
        }

        console.log("subscriber offer sdp:", offerSdp);
        console.log("update publisher midinfos:", midinfos);

        let respData = null;
        let data = {
            'roomId': this._roomId,
            'uid': this._uid,
            'remoteUid': remoteUid,
            'publishers': midinfos,
            'sdp' : offerSdp
        }

        try {
            console.log("subscribe request: ", data);
            respData = await this.ws.request('subscribe', data);
        } catch (error) {
            console.log("send subscribe message exception:", error)
            throw error
        }
        console.log("subscribe response message:", respData);

        let respSdp = respData.sdp;
        let respSdpJson = SdpTransformer.parse(respSdp);

        console.log("subscribe response json sdp:", JSON.stringify(respSdpJson));
        this._recvPC.UpdateRemoteSubscriberSdp(respSdp);

        let trackList = [];
        for (const mediaInfo of midinfos)
        {
            let newTrack = await new Promise(async (resolve, reject) =>
            {
                this._recvPC.on('newTrack', (track) => {
                    console.log("rtc receive new track:", track);
                    if (track != null) {
                        resolve(track);
                    } else {
                        reject(track);
                    }
                });
            });
            if (newTrack != null)
            {
                trackList.push(newTrack);
            }
        }
        console.log("receive new track list:", trackList);

        let mediaStream = remoteUser.CreateMedaiStream();

        for (const track of trackList)
        {
            console.log("remote user:", remoteUser, "add new track:", track);
            mediaStream.addTrack(track);
        }

        return mediaStream;
    }
};

module.exports = Client;