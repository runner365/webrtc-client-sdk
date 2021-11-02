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
    this.roomMgr.Join();
}

AppController.prototype.PublishClicked = async function () {
    this.roomMgr.PublishStream();
}

AppController.prototype.UnPublishClicked = async function () {
    this.roomMgr.PublishCloseAudio();
}

var appConntrol = new AppController();