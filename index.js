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
    this.publishButton    = document.getElementById("publish");
    this.unpublishButtton = document.getElementById("unpublish");

    this.openCamera.onclick       = this.OpenClicked.bind(this);
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

AppController.prototype.PublishClicked = async function () {
    if (!this._cameraReady) {
        console.log("the camera is not open");
        alert('the camera is not open');
        return;
    }
    this.server = document.getElementById('server').value;
    this.roomId = document.getElementById('roomId').value.toString();
    this.userId = document.getElementById('userId').value.toString();

    await this._client.PublishCamera({server: this.server,
        roomId: this.roomId,
        userId: this.userId,
        videoEnable: true,
        audioEnable: true});

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
    
    if (userContainer && mediaContainer) {
        userContainer.removeChild(mediaContainer);
        userContainer.removeChild(userLabel);
    }

    if (remoteContainerElement && userContainer) {
        remoteContainerElement.removeChild(userContainer);
    }

    videoElement   = null;
    mediaContainer = null;
    userLabel      = null;
    userContainer  = null;
}
var appConntrol = new AppController();