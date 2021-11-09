const RoomManager = require('./src/RoomManager');

console.log('------------------------------');

var AppController = function () {
    document.getElementById('roomId').value = '1001';
    document.getElementById('userId').value = Math.ceil(Math.random()*100000).toString();

    this.server = document.getElementById('server').value;
    this.roomId = document.getElementById('roomId').value.toString();
    this.userId = document.getElementById('userId').value.toString();
    this.mediaElement = document.getElementById('video_container_publish');

    console.log("server:", this.server, "roomId:", this.roomId, "userId:", this.userId);
    try {
        this.roomMgr = new RoomManager(this.server, this.roomId, this.userId);
    } catch (error) {
        console.log('room manager init error:', error);
    }
    this.remoteUsers = new Map();
    this.roomMgr.createMedia(this.mediaElement);

    this.joinButton       = document.getElementById("join");
    this.publishButton    = document.getElementById("publish");
    this.unpublishButtton = document.getElementById("unpublish");

    this.joinButton.onclick       = this.JoinClicked.bind(this);
    this.publishButton.onclick    = this.PublishClicked.bind(this);
    this.unpublishButtton.onclick = this.UnPublishClicked.bind(this);
};


AppController.prototype.JoinClicked = async function () {
    if (this.roomMgr == null) {
        throw new Error("room manager is not ready.");
    }
    await this.roomMgr.Join();

    this.roomMgr.on('newPublish', async ({remoteUid, midinfos}) => {
        console.log('new publisher remoteUid:', remoteUid, "media info:", midinfos);

        let newMediaStrema = await this.roomMgr.Subscribe(remoteUid, midinfos);
        console.log("web page get new mediastream:", newMediaStrema);

        let userContainer = document.createElement("div");
        userContainer.id = 'userContainer_' + remoteUid;

        let userLabel = document.createElement("label");
        userLabel.id = 'userLabel_' + remoteUid;
        userLabel.innerHTML = 'user: ' + remoteUid;
        userContainer.appendChild(userLabel);

        let mediaContainer = document.createElement("div");
        mediaContainer.id = 'mediaContainer_' + remoteUid;
        userContainer.appendChild(mediaContainer);

        let videoElement = document.createElement("video");
        videoElement.id = 'videoElement_' + remoteUid;
        videoElement.srcObject = newMediaStrema;
        mediaContainer.appendChild(videoElement);

        let remoteContainerElement = document.getElementById('remoteContainer');
        remoteContainerElement.appendChild(userContainer);

        videoElement.addEventListener("canplay", () => {
            console.log("remote user:", remoteUid, "canplay....");
            videoElement.play();
        });
        let userElement = {
            'midinfos' : midinfos,
            'mediasteam' : newMediaStrema
        }

        this.remoteUsers.set(remoteUid, userElement);
    });
}

AppController.prototype.PublishClicked = async function () {
    this.roomMgr.PublishStream();
}

AppController.prototype.UnPublishClicked = async function () {
    this.roomMgr.PublishCloseAudio();
}

var appConntrol = new AppController();