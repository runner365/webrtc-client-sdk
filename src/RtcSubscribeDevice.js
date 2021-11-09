const EnhancedEventEmitter = require('./EnhancedEventEmitter');

class RtcSubscribeDevice extends EnhancedEventEmitter
{
    construct()
    {
        this.mediaElement        = null;
        this.constraints         = null;
        this.stream              = null;
        this.mediaStream         = null;
        this._receiverPC         = null;
        this._senderLocalSdp     = null;
        this._senderRemoteSdp    = null;
        this._vMid               = 0;
        this._aMid               = 0;
        this.videoTrack          = null;
        this.audioTrack          = null;
        this.audioRtpTransceiver = null;
        this.videoRtpTransceiver = null;
    }

    getVideoMid() {
        return this._vMid;
    }

    getAudioMid() {
        return this._aMid;
    }

    async CreateCameraMedia(mediaElement)
    {
        this.mediaElement = mediaElement;
    }

    CreatePeerConnection() {
        let config = {
            'bundlePolicy': 'max-bundle',
            'rtcpMuxPolicy': 'require'
        };
        config.sdpSemantics = "unified-plan";
        console.log("create receive pc, config:", config);
        this._receiverPC = new RTCPeerConnection(config);
        this._receiverPC.oniceconnectionstatechange = (event) => {
            console.log("peer connection ice state change:", event, ", iceConnectionState:", this._receiverPC.iceConnectionState);
        };
        this._receiverPC.onconnectionstatechange = (event) => {
            console.log("peer connection state change:", event, ", state:", this._receiverPC.connectionState);
        };
        this._receiverPC.onsignalingstatechange = (event) => {
            console.log("peer connection signal state change:", event, ", signalingState:", this._receiverPC.signalingState);
        };
        this._receiverPC.onicecandidate = (event) => {
            console.log("peer connection ice candidate:", event);
        };
        this._receiverPC.ontrack = (e) => {
            console.log("peer connection on track event:", e);
            if (this.mediaStream == null) {
                this.mediaStream = new MediaStream();
            }
            if (e.track.kind == 'video') {
                console.log("add remote video track:", e.track);
                this.mediaStream.addTrack(e.track);
                this.emit('newTrack', e.track);
            } else if (e.track.kind == 'audio') {
                console.log("add remote audio track:", e.track);
                this.mediaStream.addTrack(e.track);
                this.emit('newTrack', e.track);
            } else {
                throw new Error("unkown track kind" + e.track.kind);
            }
        };
        console.log("create receive peer connection is done");
    }

    AddSubscriberMedia(mediaInfo) {
        if (mediaInfo.type == 'video') {
            this._receiverPC.addTransceiver("video", {direction: "recvonly"});
        } else if (mediaInfo.type == 'audio') {
            this._receiverPC.addTransceiver("audio", {direction: "recvonly"});
        } else {
            throw new Error('unkown media type:' + mediaInfo.type);
        }
    }

    async GetSubscribeSdp() {
        console.log('GetSubscribeSdp()...');
        var offer = await this._receiverPC.createOffer();
        await this._receiverPC.setLocalDescription(offer);

        //return sdp for requesting subscribe request
        return offer.sdp;
    }

    UpdateRemoteSdp(remoteSdp) {
        const answer = { type: 'answer', sdp: remoteSdp };
        this._receiverPC.setRemoteDescription(answer)
    }
};

module.exports = RtcSubscribeDevice;