import './index.css';
const Client = require('./src/Client');


console.log('------------------------------');

var AppController = function () {
    document.getElementById('roomId').value = '2001';
    document.getElementById('userId').value = Math.ceil(Math.random()*100000).toString();

    this.server = document.getElementById('server').value;
    this.roomId = document.getElementById('roomId').value.toString();
    this.userId = document.getElementById('userId').value.toString();
    this.mediaElement = document.getElementById('video_container_publish');
    var logTextArea  = document.getElementById('logTextArea');
    logTextArea.value = '';

    console.log("server:", this.server, "roomId:", this.roomId, "userId:", this.userId);
    
    this.openCamera       = document.getElementById("opencamera");
    this.joinButton       = document.getElementById("join");
    this.publishButton    = document.getElementById("publish");
    this.unpublishButtton = document.getElementById("unpublish");

    console.log('this.openCamera', this.openCamera);
    console.log('this.OpenClicked:', this.OpenClicked);
    this.openCamera.onclick       = this.OpenClicked.bind(this);
    this.joinButton.onclick       = this.JoinClicked.bind(this);
    this.publishButton.onclick    = this.PublishClicked.bind(this);
    this.unpublishButtton.onclick = this.UnPublishClicked.bind(this);

    this._client = new Client();
    this._cameraReady = false;
};

AppController.prototype.OpenClicked = async function () {
    if (this._cameraReady) {
        console.log("the camera is already open");
        return;
    }
    var cameraMediaStream = await this._client.OpenCamera();

    this.mediaElement.srcObject = cameraMediaStream;

    this.mediaElement.addEventListener("canplay", () => {
        if (this.mediaElement) {
            console.log("start play the local camera view.");
            this.mediaElement.play();
            this._cameraReady = true;
            writeLogText("camera is ready");
        }
    });
}

AppController.prototype.JoinClicked = async function () {
    this.server = document.getElementById('server').value;
    this.roomId = document.getElementById('roomId').value.toString();
    this.userId = document.getElementById('userId').value.toString();

    var usersInRoom = null;//{"users":[{"uid":"11111"}, {"uid":"22222"}]}
    try
    {
        console.log("call join api userid:", this.userId);
        usersInRoom = await this._client.Join({serverHost: this.server,
                                            roomId: this.roomId, userId: this.userId});
    }
    catch (error)
    {
        console.log("join error:", error);
        return;
    }

    writeLogText("join ok, users in room: " + JSON.stringify(usersInRoom));
    this._client.on('disconected', async(data) => {
        writeLogText('websocket is disconnected');
    });
    this._client.on('userin', async(data) => {
        writeLogText('notify userin, data:' + JSON.stringify(data));
    });
    this._client.on('userout', async(data) => {
        var remoteUid = data.uid;
        writeLogText('notify userout, data:' + JSON.stringify(data));
        removeRemoteUserView(remoteUid);

        var publishers = this._client.GetRemoteUserPublishers(remoteUid);
        if (publishers != null) {
            console.log("start unsubscirbing remote uid:", remoteUid, ", publishers:", publishers);
            writeLogText('start unsubscribe remote uid:' +  remoteUid + ", publishers:" + JSON.stringify(publishers))
            this._client.UnSubscribe(remoteUid, publishers);
        }
    });

    this._client.on('publish', async (data) => {
        try {
            var remoteUid  = data['uid'];
            var remotePcId = data['pcid'];
            var userType   = data['user_type'];

            console.log(' receive publish message user type:', userType);
            writeLogText('notify publish, data:' + JSON.stringify(data));

            var newMediaStream = await this._client.Subscribe(remoteUid, userType, remotePcId, data['publishers']);
            
            var userContainer = document.createElement("div");
            userContainer.id = 'userContainer_' + remoteUid;

            var userLabel = document.createElement("label");
            userLabel.id = 'userLabel_' + remoteUid;
            userLabel.innerHTML = 'remote user: ' + remoteUid;
            userContainer.appendChild(userLabel);
    
            var mediaContainer = document.createElement("div");
            mediaContainer.id = 'mediaContainer_' + remoteUid;
            mediaContainer.className = 'videoContainer';
            userContainer.appendChild(mediaContainer);
    
            var videoElement = document.createElement("video");
            videoElement.id = 'videoElement_' + remoteUid;
            videoElement.className = 'videoView';
            videoElement.setAttribute("playsinline", "playsinline");
            videoElement.setAttribute("autoplay", "autoplay");
            videoElement.setAttribute("loop", "loop");
            videoElement.setAttribute("controls", "controls");
            videoElement.srcObject    = newMediaStream;
            videoElement.style.width  = 320;
            videoElement.style.height = 240;
            mediaContainer.appendChild(videoElement);
    
            var remoteContainerElement = document.getElementById('remoteContainer');
            remoteContainerElement.appendChild(userContainer);
    
            console.log("start play remote uid:", remoteUid);
            await videoElement.play();
        } catch (error) {
            console.log("subscribe error:", error);
            return;
        }
    });

    this._client.on('unpublish', async(data) => {
        var remoteUid = data.uid;
        var publishersInfo = data.publishers;

        writeLogText('notify unpublish, data:' + JSON.stringify(data));
        try {
            this._client.UnSubscribe(remoteUid, publishersInfo);
        } catch (error) {
            console.log("UnSubscribe error:", error);
            throw error;
        }
        removeRemoteUserView(remoteUid);
    });
}

AppController.prototype.PublishClicked = async function () {
    if (!this._cameraReady) {
        console.log("the camera is not open");
        alert('the camera is not open');
        return;
    }
    await this._client.PublishCamera({videoEnable: true, audioEnable: true});

    writeLogText("publish roomId:" + this.roomId + ", uid:" + this.userId + ", video enable" + ", audio enable");
}

AppController.prototype.UnPublishClicked = async function () {
    await this._client.UnPublishCamera({videoDisable: true, audioDisable: true});
    writeLogText("publish roomId:" + this.roomId + ", uid:" + this.userId + ", video disable" + ", audio disable");
}

function writeLogText(logInfo) {
    var nowData = new Date();
    var logTextArea  = document.getElementById('logTextArea');
    logTextArea.value += '[';
    logTextArea.value += nowData.toLocaleString();
    logTextArea.value += '] ';
    logTextArea.value += logInfo;
    logTextArea.value += '\r\n';
    logTextArea.scrollTop = logTextArea.scrollHeight;
}

function removeRemoteUserView(remoteUid) {
    var userContainerId = 'userContainer_' + remoteUid;
    var userContainer = document.getElementById(userContainerId);
    var userLabelId = 'userLabel_' + remoteUid;
    var userLabel = document.getElementById(userLabelId);
    var mediaContainerId = 'mediaContainer_' + remoteUid;
    var mediaContainer = document.getElementById(mediaContainerId);
    var videoElementId = 'videoElement_' + remoteUid;
    var videoElement = document.getElementById(videoElementId);
    var remoteContainerElement = document.getElementById('remoteContainer');

    if (mediaContainer) {
        mediaContainer.removeChild(videoElement);
    }
    
    if (userContainer) {
        userContainer.removeChild(mediaContainer);
        userContainer.removeChild(userLabel);
    }

    if (remoteContainerElement) {
        remoteContainerElement.removeChild(userContainer);
    }

    videoElement   = null;
    mediaContainer = null;
    userLabel      = null;
    userContainer  = null;
}
var appConntrol = new AppController();