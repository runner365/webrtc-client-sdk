const SdpTransformer = require('sdp-transform');
const EnhancedEventEmitter = require('./EnhancedEventEmitter');

class StreamManager extends EnhancedEventEmitter
{
    /*
    mediaType: 'camera', 'shared screen'
    */
    construct({mediaType})
    {
        this._mediaType  = mediaType;
        this._width      = 640;
        this._height     = 480;
        this._vBitrate   = 800*1000;
        this._channel    = 2;
        this._sampleRate = 48000;

        this._mediastream = null;
        this._videoTrack  = null;
        this._audioTrack  = null;
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

    async Open()
    {
        if (this._mediastream) {
            throw new Error("the mediastream has been opened.");
        }

        let constraints = {
            video: { width: { exact: this._width }, height: { exact: thiis.height } },
            audio: {
                channelCount: this._channel,
                sampleRate: this._sampleRate,
            }
        }
        let ms = null;
        
        try {
            if (this._mediaType == 'camera')
            {
                await navigator.mediaDevices.getUserMedia(constraints);
            }
            else if (this._mediaType == 'screen')
            {
                await navigator.mediaDevices.getDisplayMedia(constraints);
            }
            else
            {
                throw new Error("the media type is error:", this._mediaType);
            }
        } catch (error) {
            throw error;
        }
        
        this._mediastream = new MediaStream();
        this._videoTrack = ms.getVideoTracks()[0];
        this._audioTrack = ms.getAudioTracks()[0];
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

;

module.exports = StreamManager;