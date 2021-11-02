
class RtcSubscribeDevice
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
        };
        console.log("create receive peer connection is done");
    }

    async StartSubscribe(midinfos) {
        console.log("start subscribe mid infos:", midinfos);
        for (const info of midinfos) {
            if (info.type == 'video') {
                this._receiverPC.addTransceiver("video", {direction: "recvonly"});
            } else if (info.type == 'audio') {
                this._receiverPC.addTransceiver("audio", {direction: "recvonly"});
            } else {
                throw new Error('unkown media type:' + info.type);
            }
        }
        var offer = await this._receiverPC.createOffer();
        await this._receiverPC.setLocalDescription(offer);

        //return sdp for requesting subscribe request
        return offer.sdp;
    }

    async UpdateRemoteSdp(remoteSdp) {
        const answer = { type: 'answer', sdp: remoteSdp };
        try {
            await this._receiverPC.setRemoteDescription(answer)            
        } catch (error) {
            console.log("set remote desc error:", error);
            throw error;
        }
    }
};

module.exports = RtcSubscribeDevice;