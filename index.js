const Client = require('./src/Client');

console.log('------------------------------');

var AppController = function () {
    document.getElementById('roomId').value = '1001';
    document.getElementById('userId').value = Math.ceil(Math.random()*100000).toString();

    this.server = document.getElementById('server').value;
    this.roomId = document.getElementById('roomId').value.toString();
    this.userId = document.getElementById('userId').value.toString();
    this.mediaElement = document.getElementById('video_container_publish');

    console.log("server:", this.server, "roomId:", this.roomId, "userId:", this.userId);
    

    this.joinButton       = document.getElementById("join");
    this.publishButton    = document.getElementById("publish");
    this.unpublishButtton = document.getElementById("unpublish");

    this.joinButton.onclick       = this.JoinClicked.bind(this);
    this.publishButton.onclick    = this.PublishClicked.bind(this);
    this.unpublishButtton.onclick = this.UnPublishClicked.bind(this);

    this._client = new Client();
};


AppController.prototype.JoinClicked = async function () {
    this.server = document.getElementById('server').value;
    this.roomId = document.getElementById('roomId').value.toString();
    this.userId = document.getElementById('userId').value.toString();

    this._client.Init({server: this.server, roomId: this.roomId, uid: this.userId});

    let cameraMediaStream = await this._client.OpenCamera();

    this.mediaElement.srcObject = cameraMediaStream;

    this.mediaElement.addEventListener("canplay", () => {
        if (this.mediaElement) {
            console.log("start play the local camera view.");
            this.mediaElement.play();
        }
    });
}

AppController.prototype.PublishClicked = async function () {

}

AppController.prototype.UnPublishClicked = async function () {

}

var appConntrol = new AppController();