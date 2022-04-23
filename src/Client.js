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
        this._connected = true;
        this._sendPCMap = new Map();//peerConnectionId, PCManager object
        this._recvPCMap = new Map();//peerConnectionId, PCManager object
        this._sendVideoStats = new MediaStatsInfo();
        this._sendAudioStats = new MediaStatsInfo();

        this._cameraIndex  = 0;
        this.httpClient = new HttpClient();

        setInterval(async () => {
            await this.OnPublisherStats();
        }, 2000);

        setInterval(async () => {
            await this.OnSubscribeStats();
        }, 2000);
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

    async PublishCamera({server, roomId, userId, videoEnable, audioEnable})
    {
        var url = 'http://' + server + '/publish/' + roomId + '/' + userId;
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
            console.log("send publish request:", data);
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
        this._sendPCMap.set(peerConnectionId, sendCameraPc);
        return;
    }

    async UnPublishCamera({videoDisable, audioDisable})
    {
        var url = 'http://' + server + '/unpublish/' + roomId + '/' + userId;
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

        this._sendPCMap.delete(sendPC.GetId());

        //send unpublish request
        var data = {
            'roomId': this._roomId,
            'uid': this._uid,
            'pcid' : sendPC.GetId()
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

    async OnPublisherStats() {
        let statsList = await this.GetPublisherRtcStats();
        if (!statsList) {
            return;
        }
        
        statsList.forEach((report) => {
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
        });

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
    }

    async GetPublisherRtcStats() {
        if (this._sendPCMap.size == 0) {
            return null;
        }

        for (const sendPc of this._sendPCMap.values()) {
            if (sendPc == null) {
                console.log('peer connection is null, the pc map length:', this._sendPCMap.size);
                continue;
            }
    
            let stats = await sendPc.GetStats();
    
            return stats;
        }

        return null;
    }

    async OnSubscribeStats() {
        if (this._remoteUsers.size == 0) {
            return;
        }

        for (const user of this._remoteUsers.values()) {
            if (user == null) {
                continue;
            }
            let pcId = user.GetPcid();

            let recvPc = this._recvPCMap.get(pcId);
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

    async Subscribe(remoteUid, userType, remotePcId, publishers)
    {
        if (!this._connected)
        {
            throw new Error('websocket is not ready');
        }

        var hasUid = this._remoteUsers.has(remoteUid);
        if (!hasUid)
        {
            throw new Error('remote uid has not exist:' + remoteUid);
        }
        var remoteUser = this._remoteUsers.get(remoteUid);

        console.log("start subscribe remote user:", remoteUser, "publishers:",
            publishers, "userType:", userType);

        var recvPC = new PCManager();
        recvPC.CreatePeerConnection('recv');
        recvPC.SetRemoteUid(remoteUid);

        for (const info of publishers) {
            recvPC.AddSubscriberMedia(info);
        }

        var offerSdp = await recvPC.GetSubscribeOfferSdp();
        console.log("update publishers:", publishers);

        var respData = null;
        var data = {
            'roomId': this._roomId,
            'uid': this._uid,
            'user_type': userType,
            'remoteUid': remoteUid,
            'remotePcId': remotePcId,
            'publishers': publishers,
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

        var respSdp = respData.sdp;
        var pcid    = respData.pcid;
        var respSdpJson = SdpTransformer.parse(respSdp);

        console.log("subscribe response json sdp:", JSON.stringify(respSdpJson));
        recvPC.SetRemoteSubscriberSdp(respSdp);

        var trackList = [];
        for (const mediaInfo of publishers)
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
            if (newTrack != null)
            {
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

        console.log("set subscribe pcid:", pcid, "publishers:", publishers);
        recvPC.SetSubscribeInfo(pcid, publishers)
        this._recvPCMap.set(pcid, recvPC);

        remoteUser.SetPcId(pcid);
        remoteUser.SetPublishers(publishers);
    
        return mediaStream;
    }

    GetRemoteUserPcId(remoteUid) {
        var remoteUser = this._remoteUsers.get(remoteUid);
        if (!remoteUser) {
            return '';
        }
        return remoteUser.GetPcId();
    }

    GetRemoteUserPublishers(remoteUid) {
        var publisers;
        var remoteUser = this._remoteUsers.get(remoteUid);
        if (!remoteUser) {
            return publisers;
        }

        return remoteUser.GetPublishers();
    }
    async UnSubscribe(remoteUid, publisers)
    {
        if (!this._connected)
        {
            throw new Error('websocket is not ready');
        }

        var hasUid = this._remoteUsers.has(remoteUid);
        if (!hasUid)
        {
            throw new Error('remote uid has not exist:' + remoteUid);
        }
        var remoteUser = this._remoteUsers.get(remoteUid);
        var pcid = '';

        console.log("start unsubscribe remote user:", remoteUser, "publishers:", publisers);

        for (var [keyPCid, recvPC] of this._recvPCMap)
        {
            pcid = recvPC.GetSubscribePcId(publisers);
            if (pcid != undefined && pcid.length > 0)
            {
                break;
            }
        }
        if (pcid == undefined || pcid.length == '')
        {
            console.log("fail to get peer connection id:", pcid);
            throw new Error("fail to get peer connection id");
        }
        
        for (const info of publisers) {
            recvPC.RemoveSubscriberMedia(info);
        }
        recvPC.SetRemoteUnSubscriberSdp();
        recvPC.ClosePC();
        remoteUser.CloseMediaStream();
        
        var data = {
            'uid': this._uid,
            'remoteUid': remoteUid,
            'pcid': pcid,
            'publishers': publisers
        }
        var respData;

        console.log("request unsubscribe data:", data);
        try {
            respData = await this.ws.request('unsubscribe', data);
        } catch (error) {
            console.log('unsubscribe error:', error);
            throw error;
        }
        console.log('unsubscribe return data:', respData);

    }
};

module.exports = Client;
