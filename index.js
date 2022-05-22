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
    
    this.initButton       = document.getElementById("init");
    this.openCamera       = document.getElementById("opencamera");
    this.publishButton    = document.getElementById("publish");
    this.unpublishButtton = document.getElementById("unpublish");
    this.subscribeButtton = document.getElementById("subscribe");
    this.unsubscribeButtton = document.getElementById("unsubscribe");

    this.initButton.onclick         = this.InitClicked.bind(this);
    this.openCamera.onclick         = this.OpenClicked.bind(this);
    this.publishButton.onclick      = this.PublishClicked.bind(this);
    this.unpublishButtton.onclick   = this.UnPublishClicked.bind(this);
    this.subscribeButtton.onclick   = this.SubscribeClicked.bind(this);
    this.unsubscribeButtton.onclick = this.unSubscribeClicked.bind(this);
    
    this._publishers = [];

    this._client = new Client();
    this._client.on('stats', (data) => {
        document.getElementById("videoWidth").value = data.video.width.toString();
        document.getElementById("videoHeight").value = data.video.height.toString();
        document.getElementById("videoFps").value = parseInt(data.video.fps).toString();
        document.getElementById("videoBps").value = parseInt(data.video.bps).toString();

        document.getElementById("audioFps").value = parseInt(data.audio.fps).toString();
        document.getElementById("audioBps").value = parseInt(data.audio.bps).toString();

        document.getElementById("Rtt").value = data.rtt.toString();
    });

    this._client.on('rtcPublishers', (rtcList) => {
        this.UpdateRtcPublishers(rtcList);
    });
    
    this._client.on('livePublishers', (liveList) => {
        this.UpdateLivePublishers(liveList);
    });
    this._cameraReady = false;
};

AppController.prototype.UpdateLivePublishers = async function (liveList) {
    for (const liveItem of liveList) {
        var uid = liveItem['uid'];

        if (uid == this.userId) {
            continue;
        }

        let isExist = false;
        for (const publisher of this._publishers) {
            if (publisher == uid) {
                isExist = true;
                break;
            }
        }

        if (isExist) {
            continue;
        }
        console.log('append live uid:', uid, ' in selects');
        this._publishers.push(uid);

        document.getElementById('publishers_select').options.add(new Option(uid, uid));
    }
}

AppController.prototype.UpdateRtcPublishers = async function (rtcList) {
    for (const rtcItem of rtcList) {
        var uid = rtcItem['uid'];
        var publishersCnt = rtcItem['publishers'];

        console.log("rtc item uid:", uid, ", publishersCnt:", publishersCnt);
        if ((publishersCnt == undefined) || (publishersCnt == 0)) {
            continue;
        }

        if (uid == this.userId) {
            continue;
        }

        let isExist = false;
        for (const publisher of this._publishers) {
            if (publisher == uid) {
                isExist = true;
                break;
            }
        }

        if (isExist) {
            continue;
        }
        console.log('append uid:', uid, ' in selects');
        this._publishers.push(uid);

        document.getElementById('publishers_select').options.add(new Option(uid, uid));
    }
}

AppController.prototype.InitClicked = async function () {
    this.server = document.getElementById('server').value;
    this.roomId = document.getElementById('roomId').value.toString();
    this.userId = document.getElementById('userId').value.toString();

    this._client.Init(this.server, this.roomId, this.userId);
}

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

    await this._client.PublishCamera({videoEnable: true, audioEnable: true});

    writeLogText("publish roomId:" + this.roomId + ", uid:" + this.userId + ", video enable" + ", audio enable");
}

AppController.prototype.UnPublishClicked = async function () {
    await this._client.UnPublishCamera({server: this.server, videoDisable: true, audioDisable: true});
    writeLogText("publish roomId:" + this.roomId + ", uid:" + this.userId + ", video disable" + ", audio disable");
}

AppController.prototype.SubscribeClicked = async function () {
    var remoteSelect = document.getElementById('publishers_select');
    var index = remoteSelect.selectedIndex;
    var remoteUid = remoteSelect.options[index].value;
    console.log("subscriber roomid:", this.roomId, ', remote userId:', remoteUid);

    try {
        var newMediaStream = await this._client.Subscribe(remoteUid);

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
        videoElement.style.height = 180;
        mediaContainer.appendChild(videoElement);

        var statsContainer = document.createElement("div");
        statsContainer.id = 'statsContainer_' + remoteUid;
        statsContainer.className = 'StatsContainer';
        mediaContainer.appendChild(statsContainer);

        var videoWidthElement = document.createElement("label");
        var videoHeightElement = document.createElement("label");
        var videoBpsElement = document.createElement("label");
        var videoFpsElement = document.createElement("label");
        var audioBpsElement = document.createElement("label");
        var audioFpsElement = document.createElement("label");
        var rttElement = document.createElement("label");

        videoWidthElement.id = 'videoWidth_' + remoteUid;
        videoHeightElement.id = 'videoHeight_' + remoteUid;
        videoHeightElement.style.paddingLeft = '10px';
        videoBpsElement.id = 'videoBps_' + remoteUid;
        videoFpsElement.id = 'videoFps_' + remoteUid;
        videoFpsElement.style.paddingLeft = '10px';
        audioBpsElement.id = 'audioBps_' + remoteUid;
        audioFpsElement.id = 'audioFps_' + remoteUid;
        audioFpsElement.style.paddingLeft = '10px';
        rttElement.id = 'rtt_' + remoteUid;
        rttElement.style.paddingLeft = '10px';

        var statsVideo1Container = document.createElement("div");
        statsVideo1Container.id = 'statsVideo1Container_' + remoteUid;
        statsVideo1Container.className = 'StatsItemContainer';
        statsContainer.appendChild(statsVideo1Container);
        
        statsVideo1Container.appendChild(videoWidthElement);
        statsVideo1Container.appendChild(videoHeightElement);

        var statsVideo2Container = document.createElement("div");
        statsVideo2Container.id = 'statsVideo2Container_' + remoteUid;
        statsVideo2Container.className = 'StatsItemContainer';
        statsContainer.appendChild(statsVideo2Container);

        statsVideo2Container.appendChild(videoBpsElement);
        statsVideo2Container.appendChild(videoFpsElement);

        var statsAudioContainer = document.createElement("div");
        statsAudioContainer.id = 'statsAudioContainer_' + remoteUid;
        statsAudioContainer.className = 'StatsItemContainer';
        statsContainer.appendChild(statsAudioContainer);

        statsAudioContainer.appendChild(audioBpsElement);
        statsAudioContainer.appendChild(audioFpsElement);
        statsAudioContainer.appendChild(rttElement);

        var remoteContainerElement = document.getElementById('remoteContainer');
        remoteContainerElement.appendChild(userContainer);

        console.log("start play remote uid:", remoteUid);
        await videoElement.play();
    } catch (error) {
        console.log('request subscribe error:', error);
    }
    return;
}

AppController.prototype.unSubscribeClicked = async function () {
    var remoteSelect = document.getElementById('publishers_select');
    var index = remoteSelect.selectedIndex;
    var remoteUid = remoteSelect.options[index].value;

    try {
        await this._client.UnSubscribe(remoteUid);

        removeRemoteUserView(remoteUid);
    } catch (error) {
        console.log("unsubscribe remote uid:", remoteUid);
    }
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