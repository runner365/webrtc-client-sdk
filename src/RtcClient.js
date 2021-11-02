const protooClient = require('protoo-client');
const wsClient = require('./WebSocketClient');
const EnhancedEventEmitter = require('./EnhancedEventEmitter');

class RtcClient extends EnhancedEventEmitter
{
    constructor() {
        super();
        this.url = "";
        this._connected = false;
        this._closed    = false;
        this._publish   = false;
        this.roomId = "";
        this.uid = "";
    }

    async Join(url, roomId, uid)
    {
        this.ws = new wsClient();

        this.url = url + '/?' + 'roomid=' + roomId + '&uid=' + uid;
        this.ws.Connect(this.url);

        await new Promise((resolve, reject) => {
            this.ws.on('open', () =>
            {
                if (this._closed)
                    return;
    
                this._connected = true;
    
                resolve(void 0);
            });
            
            this.ws.on('close', () => 
            {
                reject(new Error('protoo close'));
            });

            this.ws.on('error', (err) =>
            {
                reject(err);
            });

            this.ws.on('notification', (info) =>
            {
                try {
                    console.log("notification info:", info);
                    this.safeEmit('notification', info);
                } catch (error) {
                    console.log("notify error:", error);
                }
                
            });
        });

        console.log("ws is connected, starting joining...");
		
        let data = {
            'roomId': roomId,
            'uid': uid
        };
        let respData = null;
        try {
            respData = await this.ws.request('join', data);
        } catch (error) {
            console.log("join exception error:", error);
        }
        this.roomId = roomId;
        this.uid    = uid;
        console.log("join response:", JSON.stringify(respData));
        return respData;
    }

    async Publish(sdp)
    {
        let respData = null;
        if (!this._connected) {
            throw new Error("pubish return for connection is closed.")
        }
        if (this._publish) {
            throw new Error("user has already published, roomId:" + this.roomId + ", uid:" + this.uid);
        }
        let data = {
            'roomId': this.roomId,
            'uid': this.uid,
            'sdp' : sdp
        }

        try {
            respData = await this.ws.request('publish', data);
        } catch (error) {
            console.log("send publish message exception:", error)
            throw error
        }
        console.log("Publish response message:", respData);
        this._publish = true;

        return respData;
    }

    async UnPublish(mids) {
        let respData = null;
        if (!this._connected) {
            throw new Error("unpubish return for connection is closed.")
        }
        if (!this._publish) {
            throw new Error("user has not already published, roomId:" + this.roomId + ", uid:" + this.uid);
        }

        let data = {
            'roomId': this.roomId,
            'uid': this.uid,
            'mids' : mids
        }

        try {
            console.log("publish close request: ", data);
            respData = await this.ws.request('unpublish', data);
        } catch (error) {
            console.log("send unpublish message exception:", error)
            throw error
        }
        console.log("UnPublish response message:", respData);
        this._publish = false;

        return respData;
    }

    async Subscribe(remoteUid, midinfos, sdp) {
        let respData = null;
        if (!this._connected) {
            throw new Error("subscribe return for connection is closed.")
        }

        let data = {
            'roomId': this.roomId,
            'uid': this.uid,
            'remoteUid': remoteUid,
            'publishers': midinfos,
            'sdp' : sdp
        }

        try {
            console.log("subscribe request: ", data);
            respData = await this.ws.request('subscribe', data);
        } catch (error) {
            console.log("send subscribe message exception:", error)
            throw error
        }
        console.log("subscribe response message:", respData);

        return respData;
    }
}

module.exports = RtcClient;