const SdpTransformer = require('sdp-transform');
const EnhancedEventEmitter = require('./EnhancedEventEmitter');

const PUBLISH_SDP_OFFER_OPTIONS = {
    offerToReceiveAudio: 0,
    offerToReceiveVideo: 0,
    voiceActivityDetection: true
};

const SUBSCRIBE_SDP_OFFER_OPOTIONS = {
    offerToReceiveAudio: 1,
    offerToReceiveVideo: 1,
    voiceActivityDetection: true
};

class RtcPublishDevice extends EnhancedEventEmitter
{
    construct()
    {
        this.mediaElement        = null;
        this.constraints         = null;
        this.stream              = null;
        this.mediaStream         = null;
        this._senderPC           = null;
        this._senderLocalSdp     = null;
        this._senderRemoteSdp    = null;
        this._vMid               = 0;
        this._aMid               = 0;
        this.videoTrack          = null;
        this.audioTrack          = null;
        this.audioRtpTransceiver = null;
        this.videoRtpTransceiver = null;
    }

    Reset() {        
        this._senderPC.close();
        this._senderPC           = null;

        this.videoTrack          = null;
        this.audioTrack          = null;
        this._senderLocalSdp     = null;
        this._senderRemoteSdp    = null;
        this.audioRtpTransceiver = null;
        this.videoRtpTransceiver = null;
        this.mediaStream         = null;
        this.stream              = null;
        this._vMid               = 0;
        this._aMid               = 0;
        this.mediaElement.srcObject = null;
    }

    getVideoTrack() {
        return this.videoTrack;
    }

    getAudioTrack() {
        return this.audioTrack;
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
        this.constraints = {
            video: { width: { exact: 1280 }, height: { exact: 720 } },
            audio: {
                channelCount:2,
                sampleRate:48000,
            }
        }
        this.stream = await navigator.mediaDevices.getUserMedia(this.constraints);
        console.log("media stream video track:", this.stream.getVideoTracks()[0]);
        console.log("media stream audio track:", this.stream.getAudioTracks()[0]);
        this.videoTrack = this.stream.getVideoTracks()[0];
        this.audioTrack = this.stream.getAudioTracks()[0];
        this.mediaStream = new MediaStream();
        this.mediaStream.addTrack(this.videoTrack);
        this.mediaStream.addTrack(this.audioTrack);
        this.mediaElement.srcObject = this.mediaStream;

        await this.mediaElement.play();
        console.log("media element play is done");
    }

    CreatePeerConnection() {
        let config = {
            'bundlePolicy': 'max-bundle',
            'rtcpMuxPolicy': 'require'
        };
        config.sdpSemantics = "unified-plan";
        console.log("create pc, config:", config);
        this._senderPC = new RTCPeerConnection(config);
        this._senderPC.oniceconnectionstatechange = (event) => {
            console.log("peer connection ice state change:", event, ", iceConnectionState:", this._senderPC.iceConnectionState);
        };
        this._senderPC.onconnectionstatechange = (event) => {
            console.log("peer connection state change:", event, ", state:", this._senderPC.connectionState);
        };
        this._senderPC.onsignalingstatechange = (event) => {
            console.log("peer connection signal state change:", event, ", signalingState:", this._senderPC.signalingState);
        };
        this._senderPC.onicecandidate = (event) => {
            console.log("peer connection ice candidate:", event);
        };
        this._senderPC.ontrack = (e) => {
            console.log("peer connection on track event:", e);
        };
        console.log("create peer connection is done");
    }

    async AddSendMediaTrack(mediatracks) {
        if (!this._senderPC) {
            throw new Error('sender peerconnection is not ready');
        }
        var offer;
        try {
            for (const track of mediatracks) {
                if (track.kind == 'audio') {
                    console.log("pc addTransceiver audio, id", track.id);
                    this.audioRtpTransceiver = this._senderPC.addTransceiver(track, {direction: 'sendonly'});
                }
                if (track.kind == 'video') {
                    console.log("pc addTransceiver video, id", track.id);
                    this.videoRtpTransceiver = this._senderPC.addTransceiver(track, {direction: 'sendonly'});
                }
            }
            let op = PUBLISH_SDP_OFFER_OPTIONS;
            console.log("start creating offer, option:", op);
            offer = await this._senderPC.createOffer(op);
            await this._senderPC.setLocalDescription(offer);

            this._senderLocalSdp = SdpTransformer.parse(offer.sdp);
            console.log("local sdp object:", this._senderLocalSdp);
            for (const media of this._senderLocalSdp.media) {
                if (media.type == 'video') {
                    this._vMid = media.mid;
                } else if (media.type == 'audio') {
                    this._aMid = media.mid;
                } else {
                    console.log("media type:", media.type, "is unkown");
                }
            }
            return offer.sdp;
        } catch(error) {
            throw `add send media track error:${error}`;
        }
    }

    _removeSendRemoteSdp(infos) {
        try {
            for (const info of infos) {
                let i;
                let found = false;
                for (i = 0; i < this._senderRemoteSdp.media.length; i++) {
                    let media = this._senderRemoteSdp.media[i];
                    if (media.mid == info.mid) {
                        found = true;
                        break;
                    }
                }
                if (found) {
                    this._senderRemoteSdp.media.slice(i, 1);
                }
            }
        } catch (error) {
            console.log("remove send remote sdp error:", error);
            throw error;
        }
    }

    async removeSendMediaTrack(mediatracks) {
        let mids = [];
        try {
            for (const track of mediatracks) {
                if ((track.kind == 'video') && (track.id == this.videoTrack.id)) {
                    if (!this.videoRtpTransceiver) {
                        throw new Error('the video rtp transceiver is null');
                    }
                    this._senderPC.removeTrack(this.videoRtpTransceiver.sender);
                    mids.push({
                        'mid' : parseInt(this.videoRtpTransceiver.mid, 10),
                        'type': track.kind
                    });
                    this.mediaStream.removeTrack(track);
                    this.videoTrack = null;
                    this.videoRtpTransceiver = null;
                    
                    console.log("peerconnection remove videoRtpTransceiver.sender...");
                }

                if ((track.kind == 'audio') && (track.id == this.audioTrack.id)) {
                    if (!this.audioRtpTransceiver) {
                        throw new Error('the audio rtp transceiver is null');
                    }
                    this._senderPC.removeTrack(this.audioRtpTransceiver.sender);
                    mids.push({
                        'mid' : parseInt(this.audioRtpTransceiver.mid, 10),
                        'type': track.kind
                    });
                    this.mediaStream.removeTrack(track);
                    this.audioTrack = null;
                    this.audioRtpTransceiver = null;
    
                    console.log("peerconnection remove audioRtpTransceiver.sender...");
                }
            }

            //update peerconnection
            const offer = await this._senderPC.createOffer();
            console.log("remove send media track offer:", offer);
            await this._senderPC.setLocalDescription(offer);

            this._removeSendRemoteSdp(mids);
    
            let resSdp = SdpTransformer.write(this._senderRemoteSdp)
            const answer = { type: 'answer', sdp: resSdp };
            console.log("remove send media track answer:", answer);
        
            await this._senderPC.setRemoteDescription(answer);

            if (this.mediaStream.getTracks().length == 0) {
                console.log("set sender peer connection null.");
                this.Reset();
            }
        } catch (error) {
            throw `delete send media track error:${error}`;
        }
        return mids;
    }

    async setSenderRemoteSDP(remoteSdp) {
        try {
            this._senderRemoteSdp = SdpTransformer.parse(remoteSdp);
            console.log('set sender remote sdp:',this._senderRemoteSdp);

            const answer = { type: 'answer', sdp: remoteSdp };
            await this._senderPC.setRemoteDescription(answer);
        } catch (error) {
            console.log("setSenderRemoteSDP error:", error);
        }
    }

    getVideoMid() {
        return this._vMid;
    }

    getAudioMid() {
        return this._aMid;
    }
};

module.exports = RtcPublishDevice;