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

        this._senderRemoteSdp = null;
        this._senderLocalSdp  = null;
        this._direction       = 'send';//or 'recv'
    }

    CreatePeerConnection(direction) {
        let config = {
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
                if (e.track.kind == 'video') {
                    console.log("add remote video track:", e.track);
                    this.emit('newTrack', e.track);
                } else if (e.track.kind == 'audio') {
                    console.log("add remote audio track:", e.track);
                    this.emit('newTrack', e.track);
                } else {
                    throw new Error("unkown track kind" + e.track.kind);
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

            let op = PUBLISH_SDP_OFFER_OPTIONS;
            console.log("start creating offer, option:", op);

            offer = await this._pc.createOffer(op);
            await this._pc.setLocalDescription(offer);

            this._senderLocalSdp = SdpTransformer.parse(offer.sdp);
            console.log("local sdp object:", this._senderLocalSdp);

            let retInfo = {
                offSdp: offer.sdp,
                mids: [
                ]
            };

            for (const media of this._senderLocalSdp.media)
            {
                let mediainfo = {
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

    async SetSendAnswerSdp(remoteSdp)
    {
        try {
            this._senderRemoteSdp = SdpTransformer.parse(remoteSdp);
            console.log('set sender remote sdp:',this._senderRemoteSdp);

            const answer = { type: 'answer', sdp: remoteSdp };
            await this._pc.setRemoteDescription(answer);
        } catch (error) {
            console.log("setSenderRemoteSDP error:", error);
        }
    }

    _RemoteSenderSdpbyMid(mid)
    {
        let index = 0;
        let found = false;
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
        let transList = this._pc.getTransceivers();

        console.log("current send pc transceivers:", transList);
        for (const transceiver of transList)
        {
            let found = false;
            let mid = 0;
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

        let answerSdp = SdpTransformer.write(this._senderRemoteSdp)
        const answer = { type: 'answer', sdp: answerSdp };
        console.log("remove sender answer:", answer);
        await this._pc.setRemoteDescription(answer);
    }

    AddSubscriberMedia(mediaType) {
        if (mediaType == 'video') {
            this._pc.addTransceiver("video", {direction: "recvonly"});
        } else if (mediaType == 'audio') {
            this._pc.addTransceiver("audio", {direction: "recvonly"});
        } else {
            throw new Error('unkown media type:' + mediaType);
        }
    }

    async GetSubscribeOfferSdp() {
        console.log('GetSubscribeOfferSdp()...');
        var offer = await this._pc.createOffer();
        await this._pc.setLocalDescription(offer);

        //return sdp for requesting subscribe request
        return offer.sdp;
    }

    UpdateRemoteSubscriberSdp(remoteSdp) {
        const answer = { type: 'answer', sdp: remoteSdp };
        this._pc.setRemoteDescription(answer)
    }
};

module.exports = PCManager;