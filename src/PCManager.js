const SdpTransformer = require('sdp-transform');
const EnhancedEventEmitter = require('./EnhancedEventEmitter');

const PUBLISH_SDP_OFFER_OPTIONS = {
    offerToReceiveAudio: 0,
    offerToReceiveVideo: 0,
    voiceActivityDetection: true
};

class PCManager extends EnhancedEventEmitter
{
    constructor()
    {
        super();
        this._pc = null;

        this._vMid = 0;
        this._aMid = 0;

        this._sendSessionId     = '';
        this._recvSessionId     = '';
        this._senderRemoteSdp   = null;
        this._receiverRemoteSdp = null;
        this._direction         = 'send';//or 'recv'
        this._type              = 'screen';//or 'screen'
        this._remoteUid         = '';
        this._recvTransceivers   = new Map();//key:publisherId, value: RTPTransceiver
    }

    async GetStats() {
        if (this._pc == null) {
            console.log("peerconnection is null...");
            return null;
        }
        return await this._pc.getStats();
    }

    ClosePC()
    {
        this._pc.close();
        this._pc = null;
    }

    SetType(type)
    {
        this._type = type;
    }

    GetType()
    {
        return this._type;
    }

    SetRemoteUid(uid)
    {
        this._remoteUid = uid;
    }

    GetRemoteUid()
    {
        return this._remoteUid;
    }

    CreatePeerConnection(direction) {
        var config = {
            'bundlePolicy': 'max-bundle',
            'rtcpMuxPolicy': 'require'
        };
        config.sdpSemantics = "unified-plan";

        this._direction = direction;
        this._pc = new RTCPeerConnection(config);
        this._pc.oniceconnectionstatechange = (event) => {
            console.log("peer connection ice state change:", event, ", iceConnectionState:", this._pc.iceConnectionState);
        };
        this._pc.onconnectionstatechange = (event) => {
            console.log("peer connection state change:", event, ", state:", this._pc.connectionState);
        };
        this._pc.onsignalingstatechange = (event) => {
            console.log("peer connection signal state change:", event, ", signalingState:", this._pc.signalingState);
        };
        this._pc.onicecandidate = (event) => {
            console.log("peer connection ice candidate:", event);
        };
        this._pc.ontrack = (event) => {
            console.log("peer connection on track event:", event, 'direction:', this._direction);
            if (this._direction == 'recv')
            {
                if (event.track.kind == 'video') {
                    console.log("add remote video track:", event.track);
                    this.emit('newTrack', event.track);
                } else if (event.track.kind == 'audio') {
                    console.log("add remote audio track:", event.track);
                    this.emit('newTrack', event.track);
                } else {
                    throw new Error("unkown track kind" + event.track.kind);
                }
            }
        };
        console.log("create peer connection is done");
    }

    async AddSendMediaTrack(mediatracks) {
        if (!this._pc)
        {
            throw new Error('sender peerconnection is not ready');
        }
        var offer;
        try
        {
            for (const track of mediatracks)
            {
                if (track.kind == 'audio') {
                    console.log("pc addTransceiver audio, id", track.id);
                    this._pc.addTransceiver(track, {direction: 'sendonly'});
                }
                if (track.kind == 'video') {
                    console.log("pc addTransceiver video, id", track.id);
                    this._pc.addTransceiver(track, {direction: 'sendonly'});
                }
            }

            var op = PUBLISH_SDP_OFFER_OPTIONS;
            console.log("start creating offer, option:", op);

            offer = await this._pc.createOffer(op);
            var senderLocalSdp = SdpTransformer.parse(offer.sdp);

            let payloadMap = new Map();

            senderLocalSdp.media.forEach(media => {
                if (media.type == 'video') {
                    media.fmtp?.forEach(fmtp => {
                        if (!payloadMap.has(fmtp.payload)) {
                            let pos = fmtp.config.indexOf('apt=');
                            if (pos == 0) {
                                return;
                            }
                            payloadMap.set(fmtp.payload, true);
                            media.fmtp.push({payload: fmtp.payload, config: 'x-google-start-bitrate=1500'});
                            media.fmtp.push({payload: fmtp.payload, config: 'x-google-min-bitrate=1000'});
                            media.fmtp.push({payload: fmtp.payload, config: 'x-google-max-bitrate=3000'});
                        }
                    })
                }
            });

            console.log("local sdp object:", senderLocalSdp);
            var newSdp = SdpTransformer.write(senderLocalSdp);
            offer.sdp = newSdp;

            await this._pc.setLocalDescription(offer);

            var retInfo = {
                offSdp: offer.sdp,
                mids: [
                ]
            };

            for (const media of senderLocalSdp.media)
            {
                var mediainfo = {
                    mid: media.mid,
                    type: media.type
                };
                retInfo.mids.push(mediainfo);
            }

            return retInfo;
        } catch(error) {
            throw `add send media track error:${error}`;
        }
    }

    GetSendSessionId() {
        return this._sendSessionId;
    }

    GetRecvSessionId() {
        return this._recvSessionId;
    }

    async SetSendAnswerSdp(remoteSdp, sessionid)
    {
        try {
            this._senderRemoteSdp = SdpTransformer.parse(remoteSdp);
            console.log('set sender remote sdp:',this._senderRemoteSdp);

            const answer = { type: 'answer', sdp: remoteSdp };
            await this._pc.setRemoteDescription(answer);
            this._sendSessionId     = sessionid;
        } catch (error) {
            console.log("setSenderRemoteSDP error:", error);
        }
    }

    _RemoteSenderSdpbyMid(mid)
    {
        var index = 0;
        var found = false;
        //this._senderRemoteSdp.media.slice(i, 1);
        for (index = 0; index < this._senderRemoteSdp.media.length; index++)
        {
            if (this._senderRemoteSdp.media[index].mid == mid)
            {
                this._senderRemoteSdp.media[index].direction = 'inactive';

                this._senderRemoteSdp.media[index].port = 0;
        
                delete this._senderRemoteSdp.media[index].ext;
                delete this._senderRemoteSdp.media[index].ssrcs;
                delete this._senderRemoteSdp.media[index].ssrcGroups;
                delete this._senderRemoteSdp.media[index].simulcast;
                delete this._senderRemoteSdp.media[index].simulcast_03;
                delete this._senderRemoteSdp.media[index].rids;
                delete this._senderRemoteSdp.media[index].extmapAllowMixed;
                found = true;
                break;
            }
        }
        if (found)
        {
            console.log("remove send remote sdp index:", index, "remove sender sdp object:", this._senderRemoteSdp);
        }
    }

    async removeSendTrack(removeMids)
    {
        var transList = this._pc.getTransceivers();

        console.log("current send pc transceivers:", transList, "remove mids:", removeMids);
        for (const transceiver of transList)
        {
            var found = false;
            var mid = 0;
            for (const removeMid of removeMids)
            {
                if (removeMid == transceiver.mid)
                {
                    found = true;
                    mid = removeMid;
                    break;
                }
            }
            if (found)
            {
                transceiver.sender.replaceTrack(null);
                this._pc.removeTrack(transceiver.sender);
                this._RemoteSenderSdpbyMid(mid);
            }
        }

        const offer = await this._pc.createOffer();
        console.log("remove sender offer:", offer);

        await this._pc.setLocalDescription(offer);

        var answerSdp = SdpTransformer.write(this._senderRemoteSdp)
        const answer = { type: 'answer', sdp: answerSdp };
        console.log("remove sender answer:", answer);
        await this._pc.setRemoteDescription(answer);
    }

    AddSubscriberMedia(remoteUid)
    {
        var videoTransceiver = this._pc.addTransceiver("video", {direction: "recvonly"});
        this._recvTransceivers.set(remoteUid + '_video', videoTransceiver);

        var audioTransceiver = this._pc.addTransceiver("audio", {direction: "recvonly"});
        this._recvTransceivers.set(remoteUid + '_audio', audioTransceiver);
    }

    async GetSubscribeOfferSdp()
    {
        var offer = await this._pc.createOffer();
        var offerSdpObj = SdpTransformer.parse(offer.sdp);
        
        console.log("subscriber offer sdp:", offerSdpObj);
        let payloadMap = new Map();
		offerSdpObj.media.forEach(media => {
			media.rtcpFb?.forEach(rtcpfb => {
                if (!payloadMap.has(rtcpfb.payload)) {
                    payloadMap.set(rtcpfb.payload, "rrtr");
                    media.rtcpFb.push({payload:rtcpfb.payload, type:'rrtr'});
                }
            })
		});
        
        var newSdp = SdpTransformer.write(offerSdpObj);
        console.log("new sdp:", newSdp);
        offer.sdp = newSdp;
        await this._pc.setLocalDescription(offer);

        //return sdp for requesting subscribe request
        return offer.sdp;
    }

    SetRemoteSubscriberSdp(remoteSdp, sessionid) {
        this._recvSessionId     = sessionid;
        this._receiverRemoteSdp = SdpTransformer.parse(remoteSdp);
        const answer = { type: 'answer', sdp: remoteSdp };
        this._pc.setRemoteDescription(answer)
    }
};

module.exports = PCManager;
