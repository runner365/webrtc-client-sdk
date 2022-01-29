const SdpTransformer = require('sdp-transform');
const EnhancedEventEmitter = require('./EnhancedEventEmitter');

class StreamManager extends EnhancedEventEmitter
{
    /*
    mediaType: 'camera', 'shared screen'
    */
    construct() {
        this._width      = 640;
        this._height     = 480;
        this._vBitrate   = 800*1000;
        this._channel    = 2;
        this._sampleRate = 48000;

        this._mediastream = null;
        this._videoTrack  = null;
        this._audioTrack  = null;

        console.log("StreamManager construct mediatype:", mediaType);
    }

    GetAudioTrack()
    {
        return this._audioTrack;
    }

    GetVideoTrack()
    {
        return this._videoTrack;
    }

    SetVideoParam({width, height, bitrate})
    {
        this._width    = width;
        this._height   = height;
        this._vBitrate = bitrate;
    }

    SetAudioParam({channel, sampleRate})
    {
        this._channel    = channel;
        this._sampleRate = sampleRate;
    }

    async Open(mediaType)
    {
        if (this._mediastream) {
            throw new Error("the mediastream has been opened.");
        }
        this._mediaType = mediaType;
        var constraints = {
            video: { width: { exact: this._width }, height: { exact: this.height } },
            audio: {
                channelCount: this._channel,
                sampleRate: this._sampleRate,
            }
        }
        var ms = null;
        
        console.log("stream manager open mediatype:", mediaType, "constraints:", constraints);
        try {
            if (mediaType == 'camera')
            {
                ms = await navigator.mediaDevices.getUserMedia(constraints);
            }
            else if (mediaType == 'screen')
            {
                ms = await navigator.mediaDevices.getDisplayMedia(constraints);
            }
            else
            {
                throw new Error("open media type is error:" + this._mediaType);
            }
        } catch (error) {
            console.log("open device error:", error);
            throw error;
        }
        
        var videoTracksNum = ms.getVideoTracks().length;
        var audioTracksNum = ms.getAudioTracks().length;

        console.log("video tracks number:", videoTracksNum, "audio tracks number:", audioTracksNum);

        this._mediastream = new MediaStream();
        this._videoTrack = ms.getVideoTracks()[videoTracksNum - 1];
        this._audioTrack = ms.getAudioTracks()[audioTracksNum - 1];
        this._mediastream.addTrack(this._videoTrack);
        this._mediastream.addTrack(this._audioTrack);

        console.log("the media stream is open, type:", this._mediaType,
            "videoTrack:", this._videoTrack,
            "audioTrack:", this._audioTrack);
        return this._mediastream
    }

    async Close()
    {
        if (this._mediastream == null) {
            throw new Error("the mediastream has been closed.");
        }
        this._mediastream.Close();

        this._mediastream = null;
        this._videoTrack  = null;
        this._audioTrack  = null;
    }
};

module.exports = StreamManager;