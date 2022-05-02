const EnhancedEventEmitter = require('./EnhancedEventEmitter');
const StreamManager = require('./StreamManager');
const SdpTransformer = require('sdp-transform');
const UserInfo = require('./UserInfo');
const MediaStatsInfo = require('./MediaStatsInfo');
const PCManager = require('./PCManager')
const HttpClient = require("./HttpClient");

class Client extends EnhancedEventEmitter
{
    constructor()
    {
        super();
        this._remoteUsers = new Map();//uid, UserInfo

        this._cameraStream = null;
        this._screenStream = null;

        this._closed = true;
        this._sendPCMap = new Map();//uid_send, PCManager object
        this._recvPCMap = new Map();//uid_recv, PCManager object
        this._sendVideoStats = new MediaStatsInfo();
        this._sendAudioStats = new MediaStatsInfo();
        this._server = '';
        this._uid = '';
        this._roomId = '';

        this._cameraIndex  = 0;
        this.httpClient = new HttpClient();

        setInterval(async () => {
            await this.OnRefreshPublishers();
        }, 2000);

        setInterval(async () => {
            await this.OnPublisherStats();
        }, 2000);

        setInterval(async () => {
            await this.OnSubscribeStats();
        }, 2000);
    }

    Init(server, roomId, uid) {
        this._server = server;
        this._roomId = roomId;
        this._uid    = uid;

        console.log('client init server:', server, ', roomId:', roomId, ", uid:", uid);
    }

    IsInited() {
        if ((this._server.length == 0) || (this._roomId.length == 0) || (this._uid.length == 0)) {
            return false;
        }
        return true;
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

    async PublishCamera({videoEnable, audioEnable})
    {
        if (!this.IsInited()) {
            alert('please init firstly...');
            return;
        }

        var url = 'http://' + this._server + '/publish/' + this._roomId + '/' + this._uid;
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

        var mediaTracks = [];
        if (videoEnable)
        {
            mediaTracks.push(this._cameraStream.GetVideoTrack());
        }
        if (audioEnable)
        {
            mediaTracks.push(this._cameraStream.GetAudioTrack());
        }

        var sendCameraPc = null;
        var offerInfo;
        try {
            sendCameraPc = new PCManager();
            sendCameraPc.CreatePeerConnection('send');
            sendCameraPc.SetType('camera');
            offerInfo = await sendCameraPc.AddSendMediaTrack(mediaTracks);
        } catch (error) {
            throw error;
        }

        var data = offerInfo.offSdp;

        var resp;

        try {
            console.log("send publish request url:", url, ", data:", data);
            resp = await this.httpClient.Post(url, data);
        } catch (error) {
            console.log("send publish message exception:", error)
            throw error
        }
        console.log("Publish response message:", resp);

        await sendCameraPc.SetSendAnswerSdp(resp);

        var answerSdpObj = SdpTransformer.parse(resp);
        for (const item of answerSdpObj.media)
        {
            if (item.type == 'video')
            {
                this._cameraVideoMid = item.mid;
            }
            else if (item.type == 'audio')
            {
                this._cameraAudioMid = item.mid;
            }
            else
            {
                throw new Error("the sdp type is unkown:", item.type);
            }
        }

        this._sendPCMap.set(this._uid + '_send', sendCameraPc);

        return;
    }

    async UnPublishCamera({server, videoDisable, audioDisable})
    {
        if ((this._roomId == undefined) || (this._roomId.length == 0)) {
            return;
        }
        
        var url = 'http://' + server + '/unpublish/' + this._roomId + '/' + this._uid;

        if (!this._cameraStream)
        {
            throw new Error('camera does not init');
        }

        if (!videoDisable && !audioDisable)
        {
            throw new Error('video and audio are not disable');
        }

        var removeMids = [];
        if (videoDisable)
        {
            removeMids.push(this._cameraVideoMid);
        }
        if (audioDisable)
        {
            removeMids.push(this._cameraAudioMid);
        }

        var sendPC = null;

        for (var pc of this._sendPCMap.values())
        {
            if (pc.GetType() == 'camera')
            {
                sendPC = pc;
                break;
            }
        }
        if (sendPC == null)
        {
            throw new Error("fail to find camera");
        }
        sendPC.removeSendTrack(removeMids);

        sendPC.ClosePC();

        this._sendPCMap.delete(this._uid + '_send');

        //send unpublish request
        var data = {
            'roomId': this._roomId,
            'uid': this._uid
        }

        var respData;
        try {
            console.log("unpublish request: ", data);
            respData = await this.httpClient.Post(url, data);
        } catch (error) {
            console.log("send unpublish message exception:", error)
            throw error
        }
        console.log("UnPublish response message:", respData);

        return respData;
    }

    async OnRefreshPublishers() {
        if (!this.IsInited()) {
            return;
        }
        try {
            let url = 'http://' + this._server + '/api/webrtc/room';
            let resp = await this.httpClient.Get(url);
            console.log("get room info:", resp);
            let respData = JSON.parse(resp);
            
            let rtcList  = respData['data']['rtc_list'];
            let liveList = respData['data']['live_list'];

            for (const liveUser of liveList) {
                let uid = liveUser['uid'];
                this._remoteUsers.set(uid, new UserInfo({roomId: this._roomId, uid: uid, userType: 'live'}));
            }
            for (const rtcUser of rtcList) {
                let uid = rtcUser['uid'];
                let publisherNum = rtcUser['publishers'];
                if (publisherNum > 0) {
                    this._remoteUsers.set(uid, new UserInfo({roomId: this._roomId, uid: uid, userType: 'rtc'}));
                }
            }

            if (rtcList && (rtcList.length > 0)) {
                this.safeEmit('publishers', rtcList);
            }
        } catch (error) {
            console.log("refresh publishers error:", error);
        }
    }

    async OnPublisherStats() {
        var statsList = null;
        
        try {
            statsList = await this.GetPublisherRtcStats();
            if (!statsList) {
                return;
            }

            for(const report of statsList) {
                //console.log("report type:", report.type, ", report:", JSON.stringify(report));
                if (report.type == 'outbound-rtp') {
                    if (report.mediaType == 'video') {
                        this._sendVideoStats.SetWidth(report.frameWidth);
                        this._sendVideoStats.SetHeight(report.frameHeight);
                        this._sendVideoStats.SetFps(report.framesPerSecond);
                        this._sendVideoStats.SetBytesSent(report.bytesSent);
                    } else if (report.mediaType == 'audio') {
                        this._sendAudioStats.SetFps(report.framesPerSecond);
                        this._sendAudioStats.SetBytesSent(report.bytesSent);
                        this._sendAudioStats.SetFrameSent(report.packetsSent);
                    }
                } else if (report.type == 'candidate-pair') {
                    if (report.nominated) {
                        this._sendVideoStats.SetRtt(report.currentRoundTripTime * 1000);
                    }
                }
            }
            this.safeEmit('stats', {
                'video': {
                    'width': this._sendVideoStats.GetWidth(),
                    'height': this._sendVideoStats.GetHeight(),
                    'fps': this._sendVideoStats.GetFps(),
                    'bps': this._sendVideoStats.GetSentBitsPerSec()
                },
                'audio': {
                    'fps': this._sendAudioStats.GetFps(),
                    'bps': this._sendAudioStats.GetSentBitsPerSec()
                },
                'rtt': this._sendVideoStats.GetRtt()
            });
        } catch (error) {
            //
        }
    }

    async GetPublisherRtcStats() {
        return new Promise(async (resolve, reject) => {
            if (this._sendPCMap.size == 0) {
                reject("send pc map is empty");
            }
            this._sendPCMap.forEach(function(value, key) {
                const sendPc = value;
                console.log("pc key:", key, ", peerconnection:", value);
                if (sendPc == null) {
                    console.log('peer connection is null, the pc map length:', this._sendPCMap.size);
                    reject("peer connection is null");
                }
        
                sendPc.GetStats().then(function(stats) {
                    resolve(stats);
                });
            });
        });
    }

    async OnSubscribeStats() {
        if (this._remoteUsers.size == 0) {
            return;
        }

        for (const user of this._remoteUsers.values()) {
            if (user == null) {
                continue;
            }

            let recvPc = this._recvPCMap.get(user.GetUserId() + '_recv');
            if (recvPc == null) {
                continue;
            }
            let stats = await recvPc.GetStats();
            if (stats == null) {
                continue;
            }

            stats.forEach((report) => {
                if (report.type == 'inbound-rtp') {
                    if (report.mediaType == 'video') {
                        user.RecvVideoStats().SetWidth(report.frameWidth);
                        user.RecvVideoStats().SetHeight(report.frameHeight);
                        user.RecvVideoStats().SetFps(report.framesPerSecond);
                        user.RecvVideoStats().SetBytesSent(report.bytesReceived);
                    } else if (report.mediaType == 'audio') {
                        user.RecvAudioStats().SetFps(report.framesPerSecond);
                        user.RecvAudioStats().SetBytesSent(report.bytesReceived);
                        user.RecvAudioStats().SetFrameSent(report.packetsReceived);
                    }
                } else if (report.type == 'candidate-pair') {
                    if (report.nominated) {
                        user.RecvVideoStats().SetRtt(report.currentRoundTripTime * 1000);
                    }
                }
            });

            this.safeEmit('remoteStats', {
                'uid': user.GetUserId(),
                'video': {
                    'width':  user.RecvVideoStats().GetWidth(),
                    'height': user.RecvVideoStats().GetHeight(),
                    'fps':    parseInt(user.RecvVideoStats().GetFps()),
                    'bps':    parseInt(user.RecvVideoStats().GetSentBitsPerSec())
                },
                'audio': {
                    'fps': parseInt(user.RecvAudioStats().GetFps()),
                    'bps': parseInt(user.RecvAudioStats().GetSentBitsPerSec())
                },
                'rtt': user.RecvVideoStats().GetRtt()
            });
        }
        return;
    }

    async Subscribe(remoteUid)
    {
        var hasUid = this._remoteUsers.has(remoteUid);
        if (!hasUid)
        {
            throw new Error('remote uid has not exist:' + remoteUid);
        }
        var remoteUser = this._remoteUsers.get(remoteUid);

        console.log("start subscribe remote user:", remoteUser);

        var recvPC = new PCManager();
        recvPC.CreatePeerConnection('recv');
        recvPC.SetRemoteUid(remoteUid);

        recvPC.AddSubscriberMedia(remoteUid);

        var offerSdp = await recvPC.GetSubscribeOfferSdp();

        var respData = null;
        var url = 'http://' + this._server + '/subscribe/' + this._roomId + '/' + this._uid + '/' + remoteUid;

        try {
            console.log("request subscribe url:", url);
            console.log("request subscribe sdp:", offerSdp);
            respData = await this.httpClient.Post(url, offerSdp);
        } catch (error) {
            console.log("send subscribe message exception:", error)
            throw error
        }
        console.log("subscribe response message:", respData);

        var respSdp = respData;
        var respSdpJson = SdpTransformer.parse(respSdp);

        console.log("subscribe response json sdp:", JSON.stringify(respSdpJson));
        recvPC.SetRemoteSubscriberSdp(respSdp);

        var trackList = [];
        for (var i = 0; i < 2; i++)
        {
            console.log("subscribe is waiting track ready...");
            var newTrack = await new Promise(async (resolve, reject) =>
            {
                recvPC.on('newTrack', (track) => {
                    console.log("rtc receive new track:", track);
                    if (track != null) {
                        resolve(track);
                    } else {
                        reject(track);
                    }
                });
            });
            if (newTrack != null) {
                trackList.push(newTrack);
            }
        }
        console.log("receive new track list:", trackList);

        var mediaStream = remoteUser.CreateMediaStream();

        for (const track of trackList)
        {
            console.log("remote user:", remoteUser, "add new track:", track);
            mediaStream.addTrack(track);
        }

        this._recvPCMap.set(remoteUid + '_recv', recvPC);
    
        return mediaStream;
    }

    GetRemoteUserPcId(remoteUid) {
        var remoteUser = this._remoteUsers.get(remoteUid);
        if (!remoteUser) {
            return '';
        }
        return remoteUser.GetPcId();
    }

    async UnSubscribe(remoteUid)
    {
        var hasUid = this._remoteUsers.has(remoteUid);
        if (!hasUid)
        {
            throw new Error('remote uid has not exist:' + remoteUid);
        }
        var remoteUser = this._remoteUsers.get(remoteUid);

        console.log("start unsubscribe remote user:", remoteUser);
        
        var recvPC = this._recvPCMap.get(remoteUid + '_recv');
        recvPC.ClosePC();
        remoteUser.CloseMediaStream();

        this._recvPCMap.delete(remoteUser.GetUserId() + '_recv');
        
        var respData;
        var url = 'http://' + this._server + '/unsubscribe/' + this._roomId + '/' + this._uid + '/' + remoteUid;

        try {
            console.log("unsubscribe post url:", url);
            respData = await this.httpClient.Post(url, '')
        } catch (error) {
            console.log('unsubscribe error:', error);
            throw error;
        }
        console.log('unsubscribe return data:', respData);

    }
};

module.exports = Client;
