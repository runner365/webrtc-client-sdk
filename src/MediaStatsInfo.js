
class MediaStatsInfo
{
    constructor()
    {
        this._width = 0;
        this._height = 0;

        this._fps = 0;
        this._frameSent = 0;
        this._lastFrameSent = 0;
        this._lastFpsMs = 0;

        this._bytesSent = 0;
        this._lastBytesSent = 0;
        this._lastBitsPerSecMs = 0;
        this._bitsPerSec = 0;

        this._rtt = 0;
    }

    SetWidth(width) {
        this._width = width;
    }

    GetWidth() {
        return this._width;
    }

    SetHeight(height) {
        this._height = height;
    }

    GetHeight() {
        return this._height;
    }

    SetFps(fps) {
        this._fps = fps;
    }

    GetFps() {
        let nowMs = Date.now();

        if (this._frameSent == 0) {
            this._lastFpsMs     = nowMs;
            this._lastFrameSent = this._frameSent;
            return this._fps;
        }

        let durationMs = nowMs - this._lastFpsMs;
        let frameCnt = this._frameSent - this._lastFrameSent;

        if (durationMs == 0) {
            return this._fps;
        }

        this._fps = frameCnt * 1000 / durationMs;

        this._lastFpsMs     = nowMs;
        this._lastFrameSent = this._frameSent;

        return this._fps;
    }

    SetFrameSent(frameSent) {
        this._frameSent = frameSent;
    }

    SetBytesSent(bytesSent) {
        this._bytesSent = bytesSent;
    }

    GetBytesSent() {
        return this._bytesSent;
    }

    GetSentBitsPerSec() {
        let nowMs = Date.now();

        if (this._lastBitsPerSecMs == 0) {
            this._lastBitsPerSecMs = nowMs;
            this._lastBytesSent    = this._bytesSent;
            return 0;
        }

        let durationMs = nowMs - this._lastBitsPerSecMs;
        let bytes = this._bytesSent - this._lastBytesSent;

        if (durationMs == 0) {
            return this._bitsPerSec;
        }

        this._bitsPerSec = bytes * 8.0 / durationMs;

        this._lastBitsPerSecMs = nowMs;
        this._lastBytesSent    = this._bytesSent;

        return this._bitsPerSec;
    }

    SetRtt(rtt) {
        this._rtt = rtt;
    }

    GetRtt() {
        return this._rtt;
    }
};

module.exports = MediaStatsInfo;