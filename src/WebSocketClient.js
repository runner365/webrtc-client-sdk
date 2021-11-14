const EnhancedEventEmitter = require('./EnhancedEventEmitter');

class WebSocketClient extends EnhancedEventEmitter
{
    constructor() {
        super();
        this.connectFlag = false;
        this.wsConn = null;
        this.id = 0;
        this._sents = new Map();
    }

    async Connect(url) {
        console.log("websocket url:", url);
        try {
            this.wsConn = new WebSocket(url);

            this.wsConn.onopen = () => {
                console.log("ws client is opened....");
                this.safeEmit('open');
            };
            this.wsConn.onmessage = (evt) => {
                if (!evt.data) {
                    return;
                }
                this._handleMessage(evt.data);
            };
            
            this.wsConn.onclose = () => {
                console.log("ws client closed...");
                this.safeEmit('close');
            };
        } catch (error) {
            console.log("websocket exception:", error);
            this.safeEmit('error');
        }
    }

    _handleMessage(msg) {
        console.log("handel message:", msg);
        var data = JSON.parse(msg);
        var request = data['request'];
        if ((request != null) && (request == true)) {
            this._handleRequest(data);
            return;
        }

        var response = data['response'];
        if ((response != null) && (response == true)) {
            this._handleResponse(data);
            return;
        }

        var notification = data['notification'];
        if ((notification != null) && (notification == true)) {
            this._handleNotification(data);
            return;
        }
    }

    handleRequest(data) {
		try
		{
			this.emit('request',
				// Request.
				data,
				// accept() function.
				(dataAck) =>
				{
                    var response = {
                        'response': true,
                        'id': data['id'],
                        'ok': true,
                        data: dataAck
                    };
                    this.wsConn.send(JSON.stringify(response));
				},
				// reject() function.
				(errorCode, errorReason) =>
				{
					if (errorCode instanceof Error)
					{
						errorReason = errorCode.message;
						errorCode = 500;
					}
					else if (typeof errorCode === 'number' && errorReason instanceof Error)
					{
						errorReason = errorReason.message;
					}
                    var response = {
                        'response': true,
                        'id': data['id'],
                        'ok': false,
                        'errorCode': errorCode,
                        'errorReason': errorReason
                    };
                    this.wsConn.send(JSON.stringify(response));
				});
		}
		catch (error)
		{
            var response = {
                'response': true,
                'id': data['id'],
                'ok': false,
                'errorCode': 500,
                'errorReason': String(error)
            };
            this.wsConn.send(JSON.stringify(response));
		}
    }

    _handleResponse(data) {
        var id = data['id'];
        const sent = this._sents.get(id);

        if (!sent) {
            return;
        }
        var ok = data['ok'];
        var info = data['data'];
        if (ok && (info != null)) {
            sent.resolve(info);
        } else {
            var errorCode   = data['errorCode'];
            var errorReason = data['errorReason'];

            console.log("response error code:", errorCode, ", reason:", errorReason);
            const err = new Error(errorReason);
            err.code = errorCode;
            sent.reject(err);
        }
    }

    _handleNotification(data) {
        this.safeEmit('notification', data);
    }

    async request(method, data) {
        var id = this.id++;
        var body = {
            'request' : true,
            'id': id,
            'method': method,
            'data' : data
        }

        this.wsConn.send(JSON.stringify(body));
        const timeout = 1500 * (15 + (0.1 * this._sents.size));

        return new Promise((pResolve, pReject) => {
            const sent = {
                id: id,
                method: method,
                resolve: (data2) => {
                    if (!this._sents.delete(id)) {
                        return;
                    }
					clearTimeout(sent.timer);
					pResolve(data2);
                },
                reject : (error) => {
					if (!this._sents.delete(id))
						return;

					clearTimeout(sent.timer);
					pReject(error);
                },
				timer : setTimeout(() =>
				{
					if (!this._sents.delete(id))
						return;

					pReject(new Error('request timeout'));
				}, timeout),
				close : () =>
				{
					clearTimeout(sent.timer);
					pReject(new Error('peer closed'));
				}
            };
            this._sents.set(id, sent);
        });
    }

    async notify(method, data) {
        var body = {
            'notification' : true,
            'method': method,
            'data' : data
        }

        this.wsConn.send(JSON.stringify(body));
    }
}

module.exports = WebSocketClient;